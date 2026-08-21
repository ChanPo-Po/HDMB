/************************************************************
 POPOPHONE - HDMB / CTV API - CẤU TRÚC MỚI
 Sheet 1: HOSO_HDMB
 SO_HD | MA_CTV | NGAY_LAP | NHAN_VIEN_NHAN | SDT_NHAN_VIEN |
 BO_PHAN | HINH_THUC_THANH_TOAN | TONG_SL | TONG_TIEN | BANG_CHU | NGAY_TAO

 Sheet 2: CHITIET_HDMB
 .SO_HD | IMEI | TEN_MAY | GB | MAU | TINH_TRANG | DVT |
 SO_LUONG | DON_GIA | THANH_TIEN | GHI_CHU

 Sheet 3: CTV
 MA_CTV | TEN_NGUOI_BAN | SDT | CCCD | DIA_CHI | NGAY_CAP | NOI_CAP
************************************************************/

const CFG = {
  HOSO: 'HOSO_HDMB',
  CHITIET: 'CHITIET_HDMB',
  CTV: 'CTV',
  TZ: 'Asia/Ho_Chi_Minh'
};

function doGet(){ return json_({ok:true, service:'POPOPHONE HDMB CTV API'}); }
function doPost(e){
  try{
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '').trim();
    if(action === 'listCTV') return json_(listCTV_());
    if(action === 'checkIMEIs') return json_(checkIMEIs_(body.imeis || []));
    if(action === 'saveContract') return json_(saveContract_(body.data || {}));
    if(action === 'searchContracts') return json_(searchContracts_(body.keyword || ''));
    if(action === 'getContract') return json_(getContract_(body.contractNo || ''));
    if(action === 'getDocNos') return json_(getDocNos_(body.kind || '', body.keys || []));
    return json_({ok:false,message:'Action không hợp lệ: '+action});
  }catch(err){ return json_({ok:false,message:String(err && err.message || err)}); }
}

function json_(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sh_(name){ const sh=ss_().getSheetByName(name); if(!sh) throw new Error('Không tìm thấy sheet '+name); return sh; }
function clean_(v){ return String(v == null ? '' : v).trim(); }
function digits_(v){ return clean_(v).replace(/\D/g,''); }
function moneyNumber_(v){ if(typeof v==='number') return v; return Number(clean_(v).replace(/[^0-9-]/g,''))||0; }
function now_(){ return Utilities.formatDate(new Date(),CFG.TZ,'dd/MM/yyyy HH:mm:ss'); }
function ymd_(){ return Utilities.formatDate(new Date(),CFG.TZ,'yyyyMMdd'); }
function makeSoHd_(){ return 'HS-'+ymd_()+'-'+String(Math.floor(1000+Math.random()*9000)); }
function headerMap_(sh){ const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]; const m={}; h.forEach((x,i)=>m[clean_(x)]=i); return {headers:h,map:m}; }
function rowObj_(headers,row){ const o={}; headers.forEach((h,i)=>o[h]=row[i]); return o; }
function stripSo_(v){ return clean_(v).replace(/^Số\s*:\s*/i,'').trim(); }

function getDocNos_(kind, keys){
  kind=clean_(kind).toUpperCase();
  if(['BBBG','DNTT'].indexOf(kind)<0) throw new Error('Loại số chứng từ không hợp lệ');
  keys=(keys||[]).map(clean_).filter(Boolean);
  if(!keys.length) return {ok:true,numbers:[]};
  const year=Utilities.formatDate(new Date(),CFG.TZ,'yyyy');
  const props=PropertiesService.getScriptProperties();
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    let seq=Number(props.getProperty(kind+'_SEQ_'+year)||0);
    const numbers=keys.map(key=>{
      const mapKey=kind+'_MAP_'+year+'_'+Utilities.base64EncodeWebSafe(key).replace(/=+$/,'');
      let no=props.getProperty(mapKey);
      if(!no){
        seq++;
        no=kind+'-'+year+'-'+String(seq).padStart(5,'0');
        props.setProperty(mapKey,no);
      }
      return no;
    });
    props.setProperty(kind+'_SEQ_'+year,String(seq));
    return {ok:true,numbers:numbers};
  } finally { lock.releaseLock(); }
}

function listCTV_(){
  const sh=sh_(CFG.CTV), last=sh.getLastRow(); if(last<2) return {ok:true,results:[]};
  const {headers}=headerMap_(sh); const rows=sh.getRange(2,1,last-1,headers.length).getDisplayValues();
  return {ok:true,results:rows.map(r=>rowObj_(headers,r)).filter(x=>clean_(x.MA_CTV)).map(x=>({
    MA_CTV:stripSo_(x.MA_CTV), TEN_NGUOI_BAN:clean_(x.TEN_NGUOI_BAN), SDT:digits_(x.SDT), CCCD:digits_(x.CCCD),
    DIA_CHI:clean_(x.DIA_CHI), NGAY_CAP:clean_(x.NGAY_CAP), NOI_CAP:clean_(x.NOI_CAP)
  }))};
}

function findCTV_(ma){
  ma=stripSo_(ma); if(!ma) return null;
  const r=listCTV_().results.find(x=>stripSo_(x.MA_CTV)===ma); return r||null;
}

function checkIMEIs_(imeis){
  const wanted=(imeis||[]).map(clean_).filter(Boolean); if(!wanted.length) return {ok:true,duplicates:[]};
  const sh=sh_(CFG.CHITIET), last=sh.getLastRow(); if(last<2) return {ok:true,duplicates:[]};
  const {headers,map}=headerMap_(sh); const idx=map['IMEI']; if(idx==null) throw new Error('CHITIET_HDMB thiếu cột IMEI');
  const rows=sh.getRange(2,1,last-1,headers.length).getDisplayValues();
  const found=new Set(rows.map(r=>clean_(r[idx]))); return {ok:true,duplicates:wanted.filter(x=>found.has(x))};
}

function saveContract_(data){
  const info=data.info||{}, items=Array.isArray(data.items)?data.items:[];
  if(!items.length) throw new Error('Chưa có máy để lưu');
  const maCTV=stripSo_(info.maCTV||info.MA_CTV); if(!maCTV) throw new Error('Chưa chọn MA_CTV');
  const ctv=findCTV_(maCTV); if(!ctv) throw new Error('MA_CTV không tồn tại trong sheet CTV: '+maCTV);
  const dup=checkIMEIs_(items.map(x=>x.imei)).duplicates; if(dup.length) throw new Error('IMEI đã tồn tại: '+dup.join(', '));
  const soHd=clean_(info.contractNo)||makeSoHd_();
  const totalQty=items.reduce((s,x)=>s+Number(x.qty||0),0);
  const total=items.reduce((s,x)=>s+Number(x.qty||0)*Number(x.price||0),0);
  const hoso=sh_(CFG.HOSO), hm=headerMap_(hoso);
  const hobj={SO_HD:soHd,MA_CTV:maCTV,NGAY_LAP:clean_(info.date),NHAN_VIEN_NHAN:clean_(info.staff),SDT_NHAN_VIEN:digits_(info.staffPhone),BO_PHAN:clean_(info.department),HINH_THUC_THANH_TOAN:clean_(info.payment),TONG_SL:totalQty,TONG_TIEN:total,BANG_CHU:clean_(info.totalWords),NGAY_TAO:now_()};
  hoso.appendRow(hm.headers.map(h=>hobj[h]!==undefined?hobj[h]:''));
  const ct=sh_(CFG.CHITIET), cm=headerMap_(ct);
  const out=items.map(x=>{ const o={'.SO_HD':soHd,IMEI:clean_(x.imei),TEN_MAY:clean_(x.model),GB:clean_(x.gb),MAU:clean_(x.color),TINH_TRANG:clean_(x.condition),DVT:clean_(x.unit)||'Máy',SO_LUONG:Number(x.qty||1),DON_GIA:Number(x.price||0),THANH_TIEN:Number(x.qty||1)*Number(x.price||0),GHI_CHU:clean_(x.note)}; return cm.headers.map(h=>o[h]!==undefined?o[h]:''); });
  if(out.length) ct.getRange(ct.getLastRow()+1,1,out.length,cm.headers.length).setValues(out);
  return {ok:true,contractNo:soHd,message:'Đã lưu '+items.length+' máy'};
}

function searchContracts_(keyword){
  keyword=clean_(keyword).toLowerCase();
  const hs=sh_(CFG.HOSO), last=hs.getLastRow();
  if(last<2) return {ok:true,results:[]};
  const {headers}=headerMap_(hs);
  const rows=hs.getRange(2,1,last-1,headers.length).getDisplayValues();
  const ctvList=listCTV_().results;

  // Gom IMEI theo mã hồ sơ để Tra cứu thực sự tìm được bằng IMEI.
  const imeiBySoHd={};
  const ct=sh_(CFG.CHITIET), cm=headerMap_(ct), clast=ct.getLastRow();
  if(clast>=2){
    ct.getRange(2,1,clast-1,cm.headers.length).getDisplayValues().forEach(r=>{
      const x=rowObj_(cm.headers,r), so=clean_(x['.SO_HD']), im=clean_(x.IMEI);
      if(!so) return;
      if(!imeiBySoHd[so]) imeiBySoHd[so]=[];
      if(im) imeiBySoHd[so].push(im);
    });
  }

  const results=[];
  rows.forEach(r=>{
    const h=rowObj_(headers,r);
    const c=ctvList.find(x=>stripSo_(x.MA_CTV)===stripSo_(h.MA_CTV))||{};
    const imeis=imeiBySoHd[clean_(h.SO_HD)]||[];
    const blob=[h.SO_HD,h.MA_CTV,c.TEN_NGUOI_BAN,c.SDT,c.CCCD].concat(imeis).join(' ').toLowerCase();
    if(!keyword||blob.includes(keyword)) results.push({
      contractNo:h.SO_HD, maCTV:stripSo_(h.MA_CTV), date:h.NGAY_LAP,
      sellerName:c.TEN_NGUOI_BAN||'', sellerPhone:c.SDT||'', imeis:imeis,
      totalQty:h.TONG_SL,totalAmount:moneyNumber_(h.TONG_TIEN)
    });
  });
  return {ok:true,results:results.slice(-100).reverse()};
}

function getContract_(soHd){
  soHd=clean_(soHd); const hs=sh_(CFG.HOSO), hm=headerMap_(hs), last=hs.getLastRow(); if(last<2) return {ok:false,message:'Không tìm thấy hồ sơ'};
  const rows=hs.getRange(2,1,last-1,hm.headers.length).getDisplayValues(); const hrow=rows.map(r=>rowObj_(hm.headers,r)).find(x=>clean_(x.SO_HD)===soHd); if(!hrow) return {ok:false,message:'Không tìm thấy hồ sơ '+soHd};
  const ctv=findCTV_(hrow.MA_CTV)||{}; const ct=sh_(CFG.CHITIET), cm=headerMap_(ct), clast=ct.getLastRow(); let items=[];
  if(clast>=2){ const cr=ct.getRange(2,1,clast-1,cm.headers.length).getDisplayValues(); items=cr.map(r=>rowObj_(cm.headers,r)).filter(x=>clean_(x['.SO_HD'])===soHd).map(x=>({imei:x.IMEI,model:x.TEN_MAY,gb:x.GB,color:x.MAU,condition:x.TINH_TRANG,unit:x.DVT,qty:moneyNumber_(x.SO_LUONG)||1,price:moneyNumber_(x.DON_GIA),amount:moneyNumber_(x.THANH_TIEN),note:x.GHI_CHU})); }
  return {ok:true,data:{info:{contractNo:hrow.SO_HD,maCTV:stripSo_(hrow.MA_CTV),date:hrow.NGAY_LAP,sellerName:ctv.TEN_NGUOI_BAN||'',sellerPhone:ctv.SDT||'',sellerCCCD:ctv.CCCD||'',sellerAddress:ctv.DIA_CHI||'',sellerIssueDate:ctv.NGAY_CAP||'',sellerIssuePlace:ctv.NOI_CAP||'',payment:hrow.HINH_THUC_THANH_TOAN||'Chuyển khoản',staff:hrow.NHAN_VIEN_NHAN||'',staffPhone:hrow.SDT_NHAN_VIEN||'',department:hrow.BO_PHAN||'Nhân viên kho',totalQty:moneyNumber_(hrow.TONG_SL),totalAmount:moneyNumber_(hrow.TONG_TIEN),totalWords:hrow.BANG_CHU||''},items:items}};
}
