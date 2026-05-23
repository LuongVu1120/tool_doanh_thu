"""
Tính doanh thu Media từ file Sapo + DANH SÁCH KÊNH + đơn trả hàng.

Logic xử lý:
1. Đọc file mapping (DANH SÁCH CÁC KÊNH MEDIA) → build lookup: ID/tên kênh → (nhân viên, tên hiển thị)
2. Đọc file đơn hàng Sapo (chua_loc/da_loc):
   - Dedupe theo Mã đơn hàng
   - Lọc: Đã hoàn thành + không "Bán trực tiếp" + không POS
   - Match channel tag → nhân viên qua fuzzy matching (lowercase, bỏ dấu Việt)
3. Đọc file đơn trả hàng → match với đơn gốc → đánh dấu loại khỏi doanh thu
4. Xuất Excel báo cáo gồm:
   - Summary
   - Doanh thu theo nhân viên (sau trừ trả hàng)
   - Doanh thu theo kênh
   - Chi tiết đơn đã match
   - Đơn trả hàng đã trừ
   - Tag chưa map (admin cần update DANH SÁCH)
   - Đơn không tag (bỏ qua đúng policy)

Cách dùng:
    python tinh_doanh_thu_media.py \
        --orders chua_loc.xlsx \
        --mapping DANH_SACH_CAC_KENH_MEDIA.xlsx \
        --returns order_return_export.xlsx \
        --output doanh_thu_media_T4.xlsx
"""

import argparse
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd


# ==================== HELPERS ====================

def normalize(s):
    """Lowercase + bỏ dấu Việt + normalize space và dấu gạch."""
    if not s:
        return ''
    s = str(s).lower().strip()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('đ', 'd')
    s = re.sub(r'[_\-/,]', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def read_sapo_excel(path):
    """Tự động detect header (0 hoặc 4) cho file Sapo."""
    for h in [4, 0, 1, 2, 3]:
        try:
            df_test = pd.read_excel(path, header=h, nrows=2)
            if 'Mã đơn hàng' in df_test.columns:
                return pd.read_excel(path, header=h)
        except Exception:
            pass
    raise ValueError(f"Không tìm thấy cột 'Mã đơn hàng' trong {path}")


# ==================== MAPPING ====================

def load_mapping(path):
    """Đọc file DANH SÁCH CÁC KÊNH MEDIA, build lookup table."""
    df = pd.read_excel(path, dtype=str, keep_default_na=False).replace('', pd.NA)
    lookup = {}
    n_unassigned = 0
    for _, row in df.iterrows():
        name = str(row['TÊN']).strip() if pd.notna(row['TÊN']) else 'CHƯA GÁN'
        if name == 'CHƯA GÁN':
            n_unassigned += 1
        channel = str(row['Kênh']).strip()
        # Map cả tên kênh hiển thị
        lookup[normalize(channel)] = (name, channel)
        # Map các ID (có thể nhiều ID/dòng, ngăn bằng / hoặc , hoặc " và ")
        ids = row['ID']
        if pd.notna(ids):
            for id_part in re.split(r'[/,]', str(ids)):
                for sub in id_part.split(' và '):
                    sub = sub.strip()
                    if sub and sub.lower() != 'nan':
                        lookup[normalize(sub)] = (name, channel)
    print(f"📋 Mapping: {len(df)} dòng → {len(lookup)} lookup keys ({n_unassigned} kênh chưa gán)")
    return lookup


def find_employee(tags_str, lookup):
    """Match channel tag → (employee, channel). Trả về (None, None) nếu không match."""
    if not isinstance(tags_str, str):
        return (None, None, [])
    huyk_tags = []
    matched = None
    for t in tags_str.split(','):
        t = t.strip()
        if not t:
            continue
        tn = normalize(t)
        # Direct match
        if not matched and tn in lookup:
            matched = lookup[tn]
        # Partial fuzzy match: tag chứa key hoặc ngược lại
        if not matched:
            for k, v in lookup.items():
                if k and len(k) > 5 and (k in tn or tn in k) and abs(len(k) - len(tn)) < 30:
                    matched = v
                    break
        # Lưu các tag có dấu hiệu HuyK để debug
        tl = t.lower()
        if ('huyk' in tl.replace(' ', '')) or re.match(r'^page_id_\d+$', tl) or re.match(r'^\d{10,11}$', t):
            huyk_tags.append(t)
    emp, ch = matched if matched else (None, None)
    return (emp, ch, huyk_tags)


# ==================== PIPELINE ====================

def process_orders(orders_path, lookup):
    print(f"\n📂 Đọc file đơn hàng: {orders_path}")
    df = read_sapo_excel(orders_path)
    df['Mã đơn hàng'] = df['Mã đơn hàng'].ffill()
    df['Tổng tiền'] = pd.to_numeric(df['Tổng tiền'], errors='coerce').fillna(0)
    total_rows = len(df)

    orders = df.drop_duplicates('Mã đơn hàng').copy()
    total_orders = len(orders)
    print(f"   {total_rows:,} dòng → {total_orders:,} đơn unique")

    # 3 filter rules
    r1 = orders[orders['Trạng thái đơn hàng'] == 'Đã hoàn thành'].copy()

    def has_ban_truc_tiep(tags):
        if not isinstance(tags, str):
            return False
        return any(t.strip() == 'Bán trực tiếp' for t in tags.split(','))

    r2 = r1[~r1['Tags'].apply(has_ban_truc_tiep)]
    r3 = r2[r2['Nguồn'] != 'POS'].copy()
    print(f"   Sau 3 rule: {total_orders:,} → {len(r1):,} → {len(r2):,} → {len(r3):,}")

    # Match employee
    r3[['employee', 'channel', 'huyk_tags']] = r3['Tags'].apply(
        lambda t: pd.Series(find_employee(t, lookup))
    )

    matched = r3[r3['employee'].notna()].copy()
    unmatched_with_tag = r3[(r3['employee'].isna()) & (r3['huyk_tags'].apply(len) > 0)].copy()
    no_tag = r3[r3['huyk_tags'].apply(len) == 0].copy()

    rev_total = r3['Tổng tiền'].sum()
    print(f"   ✅ Match: {len(matched):,} đơn / {matched['Tổng tiền'].sum()/1e9:.3f} tỷ ({matched['Tổng tiền'].sum()/rev_total*100:.1f}%)")
    print(f"   ⚠️  Có tag chưa map: {len(unmatched_with_tag):,} đơn / {unmatched_with_tag['Tổng tiền'].sum()/1e6:.0f}M")
    print(f"   ❌ Không tag: {len(no_tag):,} đơn / {no_tag['Tổng tiền'].sum()/1e9:.3f} tỷ")

    return r3, matched, unmatched_with_tag, no_tag


def process_returns(returns_path, all_orders_in_db):
    """
    all_orders_in_db: DataFrame chứa MỌI đơn từng được tính doanh thu (có employee).
    Trả về DataFrame đơn trả đã match, và đơn chưa match.
    """
    print(f"\n📂 Đọc file đơn trả hàng: {returns_path}")
    ret = pd.read_excel(returns_path, header=4)
    ret['Mã đơn hàng'] = ret['Mã đơn hàng'].astype(str).str.strip()
    ret_d = ret.drop_duplicates('Mã đơn trả hàng').copy()
    print(f"   {len(ret_d):,} đơn trả unique, {ret_d['Tổng giá trị trả hàng'].sum()/1e6:.1f}M tổng giá trị")

    # Build lookup: Mã đơn hàng → (employee, channel)
    order_to_emp = {}
    for _, row in all_orders_in_db.iterrows():
        code = str(row['Mã đơn hàng']).strip()
        order_to_emp[code] = (row['employee'], row['channel'])

    ret_d['matched'] = ret_d['Mã đơn hàng'].apply(lambda c: order_to_emp.get(c, (None, None)))
    ret_d['employee'] = ret_d['matched'].apply(lambda x: x[0])
    ret_d['channel'] = ret_d['matched'].apply(lambda x: x[1])

    matched_ret = ret_d[ret_d['employee'].notna()].copy()
    unmatched_ret = ret_d[ret_d['employee'].isna()].copy()
    print(f"   ✅ Match được đơn gốc Media: {len(matched_ret):,} đơn, trừ {matched_ret['Tổng giá trị trả hàng'].sum()/1e6:.1f}M")
    print(f"   ⚠️  Chưa match (cần lưu lịch sử DB lâu hơn): {len(unmatched_ret):,} đơn")

    return matched_ret, unmatched_ret


# ==================== REPORT ====================

def generate_report(matched_orders, matched_returns, unmatched_tags_orders, no_tag_orders,
                    unmatched_returns, output_path):
    print(f"\n💾 Ghi báo cáo: {output_path}")

    # Excluded returned orders from matched
    if len(matched_returns) > 0:
        returned_codes = set(matched_returns['Mã đơn hàng'].astype(str))
        matched_orders = matched_orders.copy()
        matched_orders['is_returned'] = matched_orders['Mã đơn hàng'].astype(str).isin(returned_codes)
        active_orders = matched_orders[~matched_orders['is_returned']].copy()
    else:
        active_orders = matched_orders.copy()
        active_orders['is_returned'] = False

    # Theo nhân viên
    gross = matched_orders.groupby('employee').agg(
        so_don=('Mã đơn hàng', 'count'),
        doanh_thu_goc=('Tổng tiền', 'sum'),
        so_kenh=('channel', 'nunique'),
    )
    returns_by_emp = matched_returns.groupby('employee').agg(
        so_don_tra=('Mã đơn trả hàng', 'count'),
        tra_hang=('Tổng giá trị trả hàng', 'sum'),
    ) if len(matched_returns) > 0 else pd.DataFrame(columns=['so_don_tra', 'tra_hang'])

    by_emp = gross.join(returns_by_emp, how='left').fillna(0)
    by_emp['doanh_thu_cuoi'] = by_emp['doanh_thu_goc'] - by_emp['tra_hang']
    by_emp = by_emp.sort_values('doanh_thu_cuoi', ascending=False).reset_index()
    by_emp.columns = ['Nhân viên', 'Số đơn', 'Doanh thu gốc (VND)', 'Số kênh', 'Số đơn trả', 'Trừ trả hàng (VND)', 'Doanh thu cuối (VND)']

    # Theo kênh
    by_channel = matched_orders.groupby(['employee', 'channel']).agg(
        so_don=('Mã đơn hàng', 'count'),
        doanh_thu=('Tổng tiền', 'sum'),
    ).reset_index().sort_values('doanh_thu', ascending=False)
    by_channel.columns = ['Nhân viên', 'Kênh', 'Số đơn', 'Doanh thu (VND)']

    # Summary
    summary_data = [
        ('Tổng số đơn sau lọc', len(matched_orders) + len(unmatched_tags_orders) + len(no_tag_orders)),
        ('Đơn match nhân viên', len(matched_orders)),
        ('Đơn có tag chưa map (cần admin update)', len(unmatched_tags_orders)),
        ('Đơn không có tag HuyK (bỏ qua)', len(no_tag_orders)),
        ('Đơn bị trả (trừ doanh thu)', len(matched_returns)),
        ('Đơn trả chưa match được (cần lưu DB)', len(unmatched_returns)),
        ('---', '---'),
        ('Tổng doanh thu Media (gốc)', int(matched_orders['Tổng tiền'].sum())),
        ('Trừ trả hàng', int(matched_returns['Tổng giá trị trả hàng'].sum()) if len(matched_returns) > 0 else 0),
        ('Doanh thu Media cuối cùng', int(active_orders['Tổng tiền'].sum())),
        ('---', '---'),
        ('Số nhân viên có doanh thu', matched_orders['employee'].nunique()),
        ('Số kênh có doanh thu', matched_orders['channel'].nunique()),
    ]
    summary = pd.DataFrame(summary_data, columns=['Chỉ số', 'Giá trị'])

    # Tag chưa map
    from collections import Counter
    tag_counter = Counter()
    tag_revenue = {}
    for _, row in unmatched_tags_orders.iterrows():
        for t in row['huyk_tags']:
            tag_counter[t] += 1
            tag_revenue[t] = tag_revenue.get(t, 0) + row['Tổng tiền']
    unmatched_tags_summary = pd.DataFrame([
        (tag, cnt, int(tag_revenue[tag])) for tag, cnt in tag_counter.most_common()
    ], columns=['Tag chưa map', 'Số đơn', 'Doanh thu (VND)'])

    # Chi tiết đơn
    detail_cols = ['Mã đơn hàng', 'Ngày hoàn thành', 'Nguồn', 'employee', 'channel',
                   'Tổng tiền', 'is_returned', 'Tags', 'Ghi chú']
    detail = matched_orders[detail_cols].copy()
    detail.columns = ['Mã đơn hàng', 'Ngày hoàn thành', 'Nguồn', 'Nhân viên', 'Kênh',
                      'Tổng tiền', 'Đã trả hàng?', 'Tags', 'Ghi chú']

    # Đơn trả đã match
    if len(matched_returns) > 0:
        ret_match_cols = ['Mã đơn trả hàng', 'Mã đơn hàng', 'employee', 'channel',
                          'Tổng giá trị trả hàng', 'Lý do trả hàng', 'Ngày hoàn thành']
        ret_match = matched_returns[ret_match_cols].copy()
        ret_match.columns = ['Mã đơn trả', 'Mã đơn gốc', 'Nhân viên', 'Kênh',
                             'Giá trị trả', 'Lý do', 'Ngày hoàn trả']
    else:
        ret_match = pd.DataFrame(columns=['Mã đơn trả', 'Mã đơn gốc', 'Nhân viên', 'Kênh',
                                          'Giá trị trả', 'Lý do', 'Ngày hoàn trả'])

    # Đơn trả chưa match
    if len(unmatched_returns) > 0:
        ret_un_cols = ['Mã đơn trả hàng', 'Mã đơn hàng', 'Gian hàng', 'Kênh bán hàng',
                       'Tổng giá trị trả hàng', 'Ngày hoàn thành']
        ret_un = unmatched_returns[ret_un_cols].copy()
        ret_un.columns = ['Mã đơn trả', 'Mã đơn gốc (chưa tìm thấy)', 'Gian hàng', 'Kênh bán',
                          'Giá trị trả', 'Ngày hoàn trả']
    else:
        ret_un = pd.DataFrame()

    # Write Excel
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        summary.to_excel(writer, sheet_name='Summary', index=False)
        by_emp.to_excel(writer, sheet_name='Doanh thu nhân viên', index=False)
        by_channel.to_excel(writer, sheet_name='Doanh thu theo kênh', index=False)
        detail.to_excel(writer, sheet_name='Chi tiết đơn', index=False)
        ret_match.to_excel(writer, sheet_name='Đơn trả đã trừ', index=False)
        if len(ret_un) > 0:
            ret_un.to_excel(writer, sheet_name='Đơn trả chưa match', index=False)
        if len(unmatched_tags_summary) > 0:
            unmatched_tags_summary.to_excel(writer, sheet_name='Tag chưa map (cần update)', index=False)

    print(f"\n✅ Hoàn thành! File output có các sheet:")
    print(f"   • Summary")
    print(f"   • Doanh thu nhân viên ({len(by_emp)} người)")
    print(f"   • Doanh thu theo kênh ({len(by_channel)} kênh)")
    print(f"   • Chi tiết đơn ({len(matched_orders):,} đơn)")
    print(f"   • Đơn trả đã trừ ({len(ret_match):,} đơn)")
    if len(ret_un) > 0:
        print(f"   • Đơn trả chưa match ({len(ret_un):,} đơn — cần DB lịch sử)")
    if len(unmatched_tags_summary) > 0:
        print(f"   • Tag chưa map ({len(unmatched_tags_summary)} tag — admin update DANH SÁCH)")


# ==================== MAIN ====================

def main():
    parser = argparse.ArgumentParser(description='Tính doanh thu Media từ Sapo Excel')
    parser.add_argument('--orders', required=True, help='File Excel đơn hàng từ Sapo')
    parser.add_argument('--mapping', required=True, help='File DANH SÁCH CÁC KÊNH MEDIA')
    parser.add_argument('--returns', help='File đơn trả hàng (tuỳ chọn)')
    parser.add_argument('--output', default='doanh_thu_media.xlsx', help='File output Excel')
    args = parser.parse_args()

    # Validate
    for f in [args.orders, args.mapping]:
        if not Path(f).exists():
            print(f"❌ Không tìm thấy file: {f}")
            sys.exit(1)

    # Pipeline
    lookup = load_mapping(args.mapping)
    all_filtered, matched, unmatched_tag, no_tag = process_orders(args.orders, lookup)

    if args.returns and Path(args.returns).exists():
        matched_ret, unmatched_ret = process_returns(args.returns, matched)
    else:
        matched_ret = pd.DataFrame()
        unmatched_ret = pd.DataFrame()

    generate_report(matched, matched_ret, unmatched_tag, no_tag, unmatched_ret, args.output)


if __name__ == '__main__':
    main()
