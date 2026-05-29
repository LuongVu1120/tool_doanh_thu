/**
 * Dữ liệu trích xuất từ file "BC Doanh thu theo nhóm VCB 2026 - Tổng4.26.pdf"
 *
 * Cấu trúc:
 *   - SHORT_NAME_TO_SAPO_ID: ánh xạ tên ngắn (HUY, NGA, VÂN...) → sapo_user_id
 *     Các mapping HIGH-CONFIDENCE đã được xác nhận qua đối chiếu tên + prefix Media/Ads.
 *     Các mapping LOW-CONFIDENCE để null — script sẽ skip + báo cho user gán tay.
 *
 *   - PDF_ENTRIES: ánh xạ (owner, refs[], channel_label)
 *     refs[] là các identifier xuất hiện trong PDF, có thể là:
 *       - Numeric: 15-19 chữ số (Facebook page ID, Instagram ID, Zalo OA ID, TikTok shop ID)
 *       - Text: tên kênh có dấu, app prefix (page_, tiktok_business_, ig_, zalo_)
 *     Script sẽ match numeric trước (chính xác qua branch_external_id),
 *     fallback text-match qua branch_name (loại bỏ dấu + lowercase).
 */

// ============================================================
// SECTION 1: ÁNH XẠ TÊN NGẮN → SAPO_USER_ID
// ============================================================
export const SHORT_NAME_TO_SAPO_ID = {
  // HIGH CONFIDENCE — match qua prefix Media/Ads/KOC hoặc tên giống hệt
  'HIỀN': 765712,       // KOC Bùi Minh Hiền [KOC] — Team Hiền leader
  'NGA': 756654,        // Nga Đỗ Thị [NGA]
  'VÂN': 760580,        // Media Nguyễn Thị Vân [MEDIA]
  'ÁNH': 848478,        // Media Nguyễn Thị Ánh [MEDIA]
  'LINH': 760993,       // Linh Vũ Thị Ngọc [LINH]
  'HUYỀN TRANG': 761331, // Media Vũ Huyền Trang [MEDIA]
  'H.TRANG': 761331,     // alias
  'VIỆT ADS': 764389,   // ads Nguyễn Viết Việt [ADS]
  'THÀNH ADS': 764388,  // Ads Nguyễn Hữu Thành [ADS]
  'TOÁN': 769260,       // Global Nguyễn Văn Toán [GLOBAL]
  'Đ.THẮNG': 787181,    // Global Nguyễn Đình Thắng [GLOBAL]

  // LOW CONFIDENCE — chưa match được trong sapo_members, để user gán tay
  // (sẽ được report ở output để user biết)
  'HUY': null,          // Có thể là chủ thương hiệu (không trong nhân viên)
  'NAM': null,          // "Dương Nam" hoặc tên khác?
  'TUÂN': null,         // không tìm thấy "Tuân" trong sapo_members
  'QUYẾT': null,
  'TIẾN ĐẠT': null,
  'LƯƠNG': null,
  'K.ĐẠT': null,
  'HỒ ĐẠT': null,
  'T.THẮNG': null,
  'CÔNG': null,
  'AN': null,           // ambiguous: KD Nguyễn An / Hải Anh / nhiều người
  'BÙI ĐOÀN': null,
  'TUẤN': null,
  'Q.ĐẠT': null,
}

// ============================================================
// SECTION 2: CÁC ENTRY TỪ FILE PDF
//   owner: tên ngắn (sẽ resolve qua SHORT_NAME_TO_SAPO_ID)
//   refs:  list identifier (Facebook page ID, IG ID, Zalo OA ID, tên kênh)
//   label: tên kênh hiển thị trong PDF (để debug)
// ============================================================
export const PDF_ENTRIES = [
  // ====== FACEBOOK pages — Team Hiền ======
  { owner: 'ÁNH', refs: ['2497800676910664'], label: 'FB - Huyk - Kim Hoàn' },
  { owner: 'HUY', refs: ['313549675173899'], label: 'FB - HuyK - Mê kim hoàn' },
  { owner: 'VÂN', refs: ['443064908892493'], label: 'FB - HuyK - Trang Sức Chế Tác' },
  { owner: 'QUYẾT', refs: ['448718284994480', '811176188744650'], label: 'FB - HuyK - Xưởng Kim Hoàn' },
  { owner: 'LINH', refs: ['458542740676011'], label: 'FB - HuyK - Xưởng Vàng Bạc' },
  { owner: 'BÙI ĐOÀN', refs: ['392809170592147'], label: 'FB - HuyK Chế Tác Kim Hoàn' },
  { owner: 'VÂN', refs: ['504308156109831'], label: 'FB - HuyK Jewelry' },
  { owner: 'AN', refs: ['2119298598397029'], label: 'FB - Huyk Silver' },
  { owner: 'TUẤN', refs: ['586371964558898'], label: 'FB - HuyK Vàng Bạc Đá Quý' },
  { owner: 'NGA', refs: ['361934747012477'], label: 'FB - HuyK Viễn Chí Bảo' },
  { owner: 'HUYỀN TRANG', refs: ['HuyK - Trang sức Viễn Chí Bảo'], label: 'FB - HuyK - Trang sức Viễn Chí Bảo' },
  { owner: 'HUYỀN TRANG', refs: ['914761368386698'], label: 'FB - HuyK Thợ Chế Tác' },
  { owner: 'ÁNH', refs: ['758889683984326'], label: 'FB - Huyk Mê Đá Quý' },
  { owner: 'HIỀN', refs: ['511855128677181'], label: 'FB - HIỀN MUỘI VIỄN CHÍ BẢO' },
  { owner: 'HỒ ĐẠT', refs: ['665692203301532'], label: 'FB - HUYK.VN' },
  { owner: 'AN', refs: ['690421720814987'], label: 'FB - HuyK Jeweler' },
  { owner: 'HỒ ĐẠT', refs: ['HuyK Thợ trang sức thủ công'], label: 'FB - HuyK Thợ trang sức thủ công' },
  { owner: 'VIỆT ADS', refs: ['661889366999995'], label: 'FB - Huyk - Nghệ Thuật Kim Hoàn' },
  { owner: 'THÀNH ADS', refs: ['HuyK - Trang sức thiết kế'], label: 'FB - Huyk - Trang sức thiết kế' },
  { owner: 'VÂN', refs: ['863815900139292', '27071643089100071'], label: 'FB - HuyK - Thợ Trang Sức Đá Quý' },
  { owner: 'HUYỀN TRANG', refs: ['1010746072116237'], label: 'FB - Trang sức Viễn Chí Bảo' },
  { owner: 'NAM', refs: ['546975468503295'], label: 'FB - Nam Bạc Thái' },
  { owner: 'LƯƠNG', refs: ['HuyK Silver', 'FB HuyK Sliver'], label: 'FB - HuyK Sliver' },

  // ====== TIKTOK (Business / for-business) ======
  { owner: 'BÙI ĐOÀN', refs: ['HuyK - Trang Sức Bạc Thái'], label: 'TT - HuyK - Trang Sức Bạc Thái' },
  { owner: 'HIỀN', refs: ['Hiền Muội - Viễn Chí Bảo'], label: 'TT - HIỀN MUỘI - VIỄN CHÍ BẢO' },
  { owner: 'TUẤN', refs: ['Bạc Thái HuyK'], label: 'TT - Bạc Thái HuyK' },
  { owner: 'ÁNH', refs: ['HuyK - Kim Hoàn Viễn Chí Bảo 2'], label: 'TT - HuyK - Kim Hoàn Viễn Chí Bảo 2' },
  { owner: 'VÂN', refs: ['HuyK - Trang Sức Chế Tác'], label: 'TT - HuyK - Trang Sức Chế Tác' },
  { owner: 'NGA', refs: ['HuyK-Viễn Chí Bảo'], label: 'TT - HuyK - Viễn Chí Bảo' },
  { owner: 'TIẾN ĐẠT', refs: ['HUYK JAPAN'], label: 'TT - HUYK JAPAN' },
  { owner: 'HUY', refs: ['HuyK Mê Kim Hoàn'], label: 'TT - HuyK Mê Kim Hoàn' },
  { owner: 'NGA', refs: ['HuyK Vàng Bạc Đá Quý'], label: 'TT - HuyK Vàng Bạc Đá Quý' },
  { owner: 'NGA', refs: ['HuyK Viễn Chí Bảo Jewelry'], label: 'TT - HuyK Viễn Chí Bảo Jewelry' },
  { owner: 'LINH', refs: ['HuyK- Xưởng Vàng Bạc 2'], label: 'TT - HuyK- Xưởng Vàng Bạc 2' },
  { owner: 'AN', refs: ['Huyk.Silver'], label: 'TT - Huyk.Silver' },
  { owner: 'ÁNH', refs: ['HuyK - Kim Hoàn Viễn Chí Bảo'], label: 'TT - HuyK - Kim Hoàn Viễn Chí Bảo' },
  { owner: 'LINH', refs: ['HuyK - Xưởng Vàng Bạc'], label: 'TT - HuyK - Xưởng Vàng Bạc' },
  { owner: 'NGA', refs: ['HuyK-Viễn Chí Bảo'], label: 'TT - HuyK - Viễn Chí Bảo (1)' },
  { owner: 'VÂN', refs: ['HuyK - Chế Tác Kim Hoàn'], label: 'TT - HuyK_Chế Tác Kim Hoàn' },
  { owner: 'HỒ ĐẠT', refs: ['Huyk_Silver', 'Huyk.Silver'], label: 'TT - Huyk_Silver' },
  { owner: 'QUYẾT', refs: ['Huyk - Xưởng Kim Hoàn'], label: 'TT - HuyK - Xưởng Kim Hoàn 2' },
  { owner: 'LINH', refs: ['Huy K- Xưởng Trang Sức'], label: 'TT - Huy K- Xưởng Trang Sức' },
  { owner: 'HỒ ĐẠT', refs: ['HuyK Thợ trang sức thủ công'], label: 'TT - HuyK Thợ trang sức thủ công' },
  { owner: 'VÂN', refs: ['Nam Blingg'], label: 'TT - Nam Blingg' },
  { owner: 'HUYỀN TRANG', refs: ['HuyK - Thợ Chế Tác Vàng Bạ'], label: 'TT - HuyK Thợ chế tác' },

  // ====== YOUTUBE ======
  { owner: 'LINH', refs: ['HuyK - Xưởng Vàng Bạc'], label: 'Youtube - HuyK - Xưởng Vàng Bạc' },
  { owner: 'TUÂN', refs: ['HuyK Viễn Chí Bảo'], label: 'Youtube - HuyK Viễn Chí Bảo' },

  // ====== ZALO ======
  { owner: 'NGA', refs: ['Trang Sức Viễn Chí Bảo'], label: 'Zalo - HuyK - Trang sức Viễn Chí Bảo' },
  { owner: 'HUY', refs: ['Huy K Mê Kim Hoàn', '0868544857'], label: 'Zalo HuyK Mê Kim Hoàn' },
  { owner: 'NGA', refs: ['1774338085536601787', '0966438662'], label: 'Zalo OA - HuyK - Trang sức Viễn Chí Bảo' },
  { owner: 'HUY', refs: ['video HuyK Mê Kim Hoàn'], label: 'Zalo Video HuyK Mê Kim Hoàn' },
  { owner: 'VÂN', refs: ['Huyk Trang Sức Chế tác', '0332075662'], label: 'Zalo Huyk Trang Sức Chế tác' },
  { owner: 'VÂN', refs: ['Huyk xưởng chế tác', '0365929943'], label: 'Zalo - Huyk xưởng chế tác' },
  { owner: 'ÁNH', refs: ['HuyK kim hoàn viễn chí bảo'], label: 'Zalo - HuyK kim hoàn viễn chí bảo' },
  { owner: 'HỒ ĐẠT', refs: ['HuyK Thợ Trang Sức Thủ Công'], label: 'Zalo - HuyK Thợ Trang Sức Thủ Công' },
  { owner: 'AN', refs: ['huyk silver'], label: 'Zalo - huyk silver' },
  { owner: 'LINH', refs: ['Huyk Chế Tác Kim Hoàn'], label: 'Zalo - Huyk Chế Tác Kim Hoàn' },
  { owner: 'LINH', refs: ['HuyK Xưởng Vàng Bạc'], label: 'zalo - HuyK Xưởng Vàng Bạc' },
  { owner: 'LINH', refs: ['Huyk - Xưởng chế tác', '0365929943'], label: 'Zalo - Huyk - Xưởng chế tác' },
  { owner: 'BÙI ĐOÀN', refs: ['355109662', 'Huyk Vcb'], label: 'Zalo - Huyk Vcb' },

  // ====== INSTAGRAM ======
  { owner: 'HUY', refs: ['HuyK - Mê kim hoàn'], label: 'IG - HuyK - Mê kim hoàn' },
  { owner: 'ÁNH', refs: ['Huyk Kim Hoàn Viễn Chí Bảo'], label: 'IG - Huyk Kim Hoàn Viễn Chí Bảo' },
  { owner: 'LINH', refs: ['17841470089440008'], label: 'IG - HuyK - Xưởng Vàng Bạc' },

  // ====== TIKTOK SHOP (seller account aliases) ======
  { owner: 'VÂN', refs: ['huyk.trangsucchetac'], label: 'TT Shop - huyk.trangsucchetac' },
  { owner: 'LINH', refs: ['huyk.xuongvangbac'], label: 'TT Shop - huyk.xuongvangbac' },
  { owner: 'ÁNH', refs: ['huyk.kimhoanvienchibao'], label: 'TT Shop - huyk.kimhoanvienchibao' },
  { owner: 'NGA', refs: ['huyk.vienchibao1'], label: 'TT Shop - huyk.vienchibao1' },
  { owner: 'HIỀN', refs: ['hienmuoi.vienchibao'], label: 'TT Shop - hienmuoi.vienchibao' },
  { owner: 'QUYẾT', refs: ['huyk.xuongkimhoan'], label: 'TT Shop - huyk.xuongkimhoan' },
  { owner: 'Q.ĐẠT', refs: ['huyk_vangbacdaquy'], label: 'TT Shop - huyk_vangbacdaquy' },
  { owner: 'LINH', refs: ['huyk.xuongvangbac2'], label: 'TT Shop - huyk.xuongvangbac2' },
  { owner: 'HUY', refs: ['huyk.mekimhoan'], label: 'TT Shop - huyk.mekimhoan' },
]
