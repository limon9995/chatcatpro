import { Injectable } from '@nestjs/common';
import {
  BusinessInfo,
  MemoLayout,
  MemoOrderData,
  MemoPreviewData,
  MemoTheme,
  UploadedMemoTemplate,
} from './memo.types';
import { MemoThemeService } from './memo-theme.service';

@Injectable()
export class MemoTemplateService {
  constructor(private readonly themeService: MemoThemeService) {}

  buildA4PageHtml(
    orders: MemoOrderData[],
    business: BusinessInfo,
    theme: MemoTheme = 'classic',
    layout: MemoLayout = 'memo',
    uploadedTemplate?: UploadedMemoTemplate | null,
    memosPerPage = 3,
  ) {
    const count = memosPerPage === 4 ? 4 : 3;
    const pages: MemoOrderData[][] = [];
    for (let i = 0; i < orders.length; i += count) {
      pages.push(orders.slice(i, i + count));
    }
    if (pages.length === 0) pages.push([]);

    const t = this.themeService.getTheme(theme, business.primaryColor);
    const title = layout === 'invoice' ? 'Invoice Print' : 'Memo Print';
    const c4 = count === 4;
    const gapMm = c4 ? 4 : 6;
    const minHMm = c4 ? 64 : 86;

    // Size-responsive values
    const hp = c4 ? '7px 10px' : '9px 12px'; // header padding
    const bp = c4 ? '6px 10px' : '9px 12px'; // body padding
    const fp = c4 ? '4px 10px' : '6px 12px'; // footer padding
    const bg = c4 ? '5px' : '8px'; // body gap
    const ld = c4 ? 34 : 42; // logo dim
    const hf = c4 ? '14.5px' : '17px'; // heading font
    const mf = c4 ? '10.5px' : '11.5px'; // meta font
    const sf = c4 ? '8.5px' : '9.5px'; // section title font
    const tf = c4 ? '9.5px' : '10.5px'; // table font
    const cotf = c4 ? '12px' : '13px'; // cod/total font
    const dh = c4 ? '9' : '11'; // dot height
    const tcelp = c4 ? '3.5px 6px' : '5px 8px'; // table cell padding
    const iboxp = c4 ? '5px 8px' : '6px 10px'; // info box padding
    const totbp = c4 ? '4px 8px' : '6px 10px'; // totals box padding
    const codp = c4 ? '3px 6px' : '4px 8px'; // cod row padding

    return `<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${this.escape(title)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{.memo-header::before,.memo-header::after{display:none!important}.section-title::before{display:none!important}}
html,body{margin:0;padding:0;font-family:"Noto Sans Bengali","Hind Siliguri","SolaimanLipi","Kalpurush",Arial,Helvetica,sans-serif;color:${t.text};background:#eaf0fb;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
.a4-page{width:210mm;min-height:297mm;padding:8mm;display:grid;grid-template-rows:repeat(${count},1fr);gap:${gapMm}mm}
.a4-page + .a4-page{page-break-before:always;break-before:page}
.memo-slot{border-radius:16px;overflow:hidden;min-height:${minHMm}mm}
.memo-card{height:100%;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;box-shadow:0 3px 16px rgba(0,0,0,.14);border:1.5px solid ${t.border};border-top:3px solid ${t.accent}}
.memo-header{display:flex;align-items:center;justify-content:space-between;padding:${hp};background:linear-gradient(135deg,${t.primary} 0%,${t.accent} 100%);color:#fff;gap:8px;position:relative;overflow:hidden}
.memo-header::after{content:'';position:absolute;right:-20px;top:-20px;width:75px;height:75px;border-radius:50%;background:rgba(255,255,255,.1);pointer-events:none}
.memo-header::before{content:'';position:absolute;left:-15px;bottom:-18px;width:55px;height:55px;border-radius:50%;background:rgba(255,255,255,.07);pointer-events:none}
.logo{width:${ld}px;height:${ld}px;min-width:${ld}px;border-radius:9px;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-size:${c4 ? '9px' : '11px'};font-weight:800;overflow:hidden;text-transform:uppercase;border:1.5px solid rgba(255,255,255,.4);flex-shrink:0;letter-spacing:.5px}
.logo img{width:100%;height:100%;object-fit:contain;display:block}
.logo.logo-hidden{display:none}
.company-block{flex:1;min-width:0}
.company-block h1{margin:0;font-size:${hf};line-height:1.2;word-break:break-word;font-weight:800;text-shadow:0 1px 3px rgba(0,0,0,.2)}
.company-meta{margin-top:3px;font-size:${c4 ? '8.5px' : '9.5px'};opacity:.93;line-height:1.4;word-break:break-word}
.memo-badge{font-size:${c4 ? '8.5px' : '9.5px'};font-weight:800;letter-spacing:1.3px;background:rgba(255,255,255,.22);padding:${c4 ? '3px 7px' : '5px 10px'};border-radius:999px;border:1.5px solid rgba(255,255,255,.4);white-space:nowrap;flex-shrink:0}
.memo-body{padding:${bp};display:flex;flex-direction:column;gap:${bg};flex:1;background:linear-gradient(170deg,${t.secondary} 0%,#ffffff 100%)}
.meta-row{display:flex;justify-content:space-between;gap:10px;font-size:${mf};line-height:1.4}
.customer-box,.business-box{border:1px solid ${t.border};background:#fff;border-radius:10px;padding:${iboxp};font-size:${mf};line-height:1.45}
.section-title{font-size:${sf};text-transform:uppercase;letter-spacing:.7px;color:${t.accent};font-weight:800;margin-bottom:3px;display:flex;align-items:center;gap:4px}
.section-title::before{content:'';display:inline-block;width:3px;height:${dh}px;background:linear-gradient(to bottom,${t.primary},${t.accent});border-radius:2px;flex-shrink:0}
.dual-box{display:grid;grid-template-columns:1fr 1fr;gap:${c4 ? '5px' : '7px'}}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid ${t.border};border-radius:10px;overflow:hidden}
th,td{padding:${tcelp};border-bottom:1px solid ${t.border};text-align:left;font-size:${tf};line-height:1.4}
th{background:linear-gradient(90deg,${t.primary},${t.accent});color:#fff;font-weight:700;letter-spacing:.3px}
td.code-cell{word-break:break-word}
.number{text-align:right;white-space:nowrap}
.totals-box{margin-top:auto;border:1px solid ${t.border};background:#fff;border-radius:10px;padding:${totbp}}
.totals-row{display:flex;justify-content:space-between;gap:8px;font-size:${mf};line-height:1.4;padding:1px 0}
.totals-row.total{font-weight:800;color:${t.primary};font-size:${cotf}}
.totals-row.cod{font-weight:800;background:linear-gradient(90deg,${t.primary}18,${t.accent}22);padding:${codp};border-radius:8px;font-size:${cotf};color:${t.primary};margin:2px 0}
.memo-footer{padding:${fp};font-size:${c4 ? '9.5px' : '10.5px'};color:#fff;background:linear-gradient(90deg,${t.primary},${t.accent}cc);line-height:1.4;text-align:center;letter-spacing:.2px;font-weight:500}
.blank-slot{width:100%;height:100%;background:linear-gradient(135deg,${t.secondary},#fff);border-radius:16px;border:2px dashed ${t.border};display:flex;align-items:center;justify-content:center;color:${t.border};font-size:11px}
.empty-row td{color:#9ca3af;text-align:center;font-style:italic}
.print-actions{padding:10px 14px;display:flex;justify-content:flex-end;gap:10px;background:#f8faff;border-bottom:1px solid #e2e8f0}
.print-actions button{border:none;background:linear-gradient(135deg,${t.primary},${t.accent});color:#fff;padding:9px 18px;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;letter-spacing:.3px;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.field-value{overflow-wrap:anywhere;word-break:break-word;white-space:normal;line-height:1.25;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.field-address{-webkit-line-clamp:6;line-height:1.2}
.uploaded-template-wrap{position:relative;width:100%;height:100%;overflow:hidden;background:#fff;border-radius:16px}
.uploaded-template-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mapped-layer{position:absolute;inset:0}
.mapped-field{position:absolute;overflow:hidden;color:#111;font-family:"Noto Sans Bengali","Hind Siliguri","SolaimanLipi","Kalpurush",Arial,Helvetica,sans-serif}
.mapped-field[data-align="center"]{text-align:center}
.mapped-field[data-align="right"]{text-align:right}
.mapped-items{border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.78);border-radius:8px;padding:6px 8px}
.field-address-mapped{overflow-wrap:anywhere;word-break:break-word;white-space:normal}
.html-template-wrap{width:100%;height:100%;overflow:hidden;background:#fff}
.html-template-doc{width:100%;height:100%;border:none;display:block}
@media print{.print-actions{display:none!important}}
</style>
</head>
<body>
<div class="print-actions no-print"><button onclick="window.print()">🖨️ Print</button></div>
${pages
  .map((pageOrders) => {
    const cardHtml: string[] = [];
    for (let i = 0; i < count; i += 1) {
      cardHtml.push(
        this.buildSingleMemoHtml(
          pageOrders[i] ?? null,
          business,
          theme,
          layout,
          uploadedTemplate,
        ),
      );
    }
    return `<div class="a4-page">${cardHtml.join('\n')}</div>`;
  })
  .join('\n')}
</body>
</html>`;
  }

  buildTemplatePreviewHtml(
    template: UploadedMemoTemplate,
    business: BusinessInfo,
    sampleData: MemoPreviewData,
  ) {
    const previewFrameHtml = this.buildA4PageHtml(
      [
        {
          id: 1001,
          customerName: sampleData.customerName,
          phone: sampleData.customerPhone,
          address: sampleData.customerAddress,
          createdAt: new Date().toISOString(),
          items: [],
        },
      ],
      business,
      'classic',
      'memo',
      template,
      3,
    );

    return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Template Preview</title><style>
      html,body{margin:0;padding:0;background:#f5f7fb;font-family:"Noto Sans Bengali","Hind Siliguri",Arial,sans-serif}
      .wrap{max-width:1200px;margin:0 auto;padding:20px;display:grid;grid-template-columns:1.2fr 1fr;gap:20px}
      .card{background:#fff;border-radius:18px;box-shadow:0 12px 30px rgba(18,38,63,.08);overflow:hidden}
      .head{padding:14px 18px;border-bottom:1px solid #e9edf5;font-weight:700}
      .stage{position:relative;aspect-ratio:2/3;background:#fff}.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff}.layer{position:absolute;inset:0}
      .box{position:absolute;border:2px solid #2d6cdf;background:rgba(45,108,223,.08);border-radius:8px;overflow:hidden;color:#111}.box[data-key="customerAddress"]{border-color:#ee7a00;background:rgba(238,122,0,.08)}
      .label{position:absolute;left:0;top:0;padding:2px 6px;background:#111;color:#fff;font-size:11px;border-bottom-right-radius:8px}
      .value{position:absolute;inset:18px 6px 6px 6px;overflow:hidden;white-space:normal;word-break:break-word;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;line-height:1.2}
      .previewpane{padding:12px}.actions{display:flex;gap:10px;padding:0 12px 12px}.btn{padding:10px 14px;border:none;border-radius:10px;background:#111;color:#fff;cursor:pointer}
      .btn.alt{background:#eef2f7;color:#111}.meta{padding:12px 18px;color:#52607a;font-size:13px;line-height:1.55}
      iframe{width:100%;height:840px;border:none}
      @media(max-width:900px){.wrap{grid-template-columns:1fr}}
    </style></head><body>
      <div class="wrap">
        <div class="card"><div class="head">Auto Mapping Overlay</div><div class="stage">${template.renderMode === 'background-mapped' ? this.buildPreviewOverlay(template, sampleData, true) : `<div style="padding:20px;font-size:14px">HTML template detected. Overlay mapping is not required for this template.</div>`}</div><div class="actions"><button class="btn" onclick="window.location.href='/memo/template/editor/${template.pageId}'">Adjust Mapping</button><button class="btn alt" onclick="fetch('/memo/template/${template.pageId}/confirm',{method:'POST'}).then(()=>location.reload())">Done</button></div></div>
        <div class="card"><div class="head">Filled Memo Preview</div><iframe srcdoc="${this.escapeAttr(previewFrameHtml)}"></iframe></div>
      </div>
    </body></html>`;
  }

  buildTemplateEditorHtml(
    template: UploadedMemoTemplate,
    business: BusinessInfo,
    sampleData: MemoPreviewData,
  ) {
    const pageId = template.pageId;
    const mapping = JSON.stringify(template.mapping || {});
    const sample = JSON.stringify(sampleData);
    return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Memo Mapping Editor</title><style>
    html,body{margin:0;padding:0;background:#eef2f7;font-family:"Noto Sans Bengali","Hind Siliguri",Arial,sans-serif;color:#1b2430}
    *{box-sizing:border-box}.layout{display:grid;grid-template-columns:1.2fr .8fr;min-height:100vh}.left{padding:18px}.right{background:#fff;border-left:1px solid #dbe3ef;padding:18px;display:flex;flex-direction:column;gap:12px}.card{background:#fff;border-radius:16px;box-shadow:0 12px 30px rgba(18,38,63,.08);overflow:hidden}.head{padding:14px 16px;border-bottom:1px solid #e8edf5;font-weight:700}.stage-wrap{padding:14px}.stage{position:relative;width:100%;aspect-ratio:2/3;background:#fff;border:1px solid #dbe3ef;border-radius:16px;overflow:hidden}.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.field{position:absolute;border:2px solid #2d6cdf;background:rgba(45,108,223,.08);border-radius:8px;cursor:move;overflow:hidden}.field.selected{outline:3px solid rgba(45,108,223,.28)}.field .tag{position:absolute;left:0;top:0;background:#111;color:#fff;font-size:11px;padding:2px 6px;border-bottom-right-radius:8px}.resize{position:absolute;width:14px;height:14px;right:0;bottom:0;background:#111;border-top-left-radius:8px;cursor:nwse-resize}.value{position:absolute;inset:18px 6px 6px 6px;overflow:hidden;word-break:break-word;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;line-height:1.2}.tools{display:flex;gap:8px;flex-wrap:wrap}.btn{padding:10px 14px;border:none;border-radius:10px;background:#111;color:#fff;cursor:pointer}.btn.alt{background:#eef2f7;color:#111}.btn.warn{background:#d97706}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.input,select{width:100%;padding:10px 12px;border:1px solid #d7dfeb;border-radius:10px;background:#fff}.label{font-size:12px;color:#52607a;margin-bottom:6px}.small{font-size:12px;color:#6b7280}.iframe{flex:1;min-height:360px;border:1px solid #dbe3ef;border-radius:14px;overflow:hidden}.iframe iframe{width:100%;height:100%;border:none}.status{padding:10px 12px;border-radius:10px;background:#f8fafc;font-size:13px}.hidden{display:none}@media(max-width:980px){.layout{grid-template-columns:1fr}.right{border-left:none;border-top:1px solid #dbe3ef}}</style></head><body>
    <div class="layout"><div class="left"><div class="card"><div class="head">Template Mapping Editor</div><div class="stage-wrap"><div class="tools" style="margin-bottom:12px"><button class="btn alt" id="previewBtn">Refresh Preview</button><button class="btn alt" id="addFieldBtn">Add Field</button><button class="btn" id="saveBtn">Save Draft</button><button class="btn warn" id="doneBtn">Done / Confirm</button></div><div class="stage" id="stage"><img class="bg" src="${this.escapeAttr(template.fileUrl)}" alt="template" /></div></div></div></div>
    <div class="right"><div class="status">Drag boxes smoothly, resize from bottom-right corner, then save. Long address is already wrapped safely in preview.</div><div><div class="label">Selected field</div><select id="fieldKey" class="input"></select></div><div class="grid"><div><div class="label">X</div><input id="x" class="input" type="number" /></div><div><div class="label">Y</div><input id="y" class="input" type="number" /></div><div><div class="label">Width</div><input id="w" class="input" type="number" /></div><div><div class="label">Height</div><input id="h" class="input" type="number" /></div><div><div class="label">Font size</div><input id="fontSize" class="input" type="number" /></div><div><div class="label">Max lines</div><input id="maxLines" class="input" type="number" /></div></div><div class="grid"><div><div class="label">Align</div><select id="align" class="input"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div><div><div class="label">Weight</div><input id="fontWeight" class="input" type="number" /></div></div><div class="tools"><button class="btn alt" id="deleteBtn">Delete Field</button></div><div class="iframe"><iframe id="previewFrame"></iframe></div></div></div>
    <script>
    const pageId=${pageId};
    const stage=document.getElementById('stage');
    const previewFrame=document.getElementById('previewFrame');
    const fieldList=['customerName','customerPhone','customerAddress','orderId','date','businessName','businessPhone','codAmount','totalAmount','deliveryFee','items'];
    const initialMapping=${JSON.stringify(this.escapeForScript(mapping))};
    const initialSample=${JSON.stringify(this.escapeForScript(sample))};
    let fields=initialMapping ? JSON.parse(initialMapping) : {};
    const sampleData=initialSample ? JSON.parse(initialSample) : {};
    let selected=null, drag=null;
    const controls={fieldKey:document.getElementById('fieldKey'),x:document.getElementById('x'),y:document.getElementById('y'),w:document.getElementById('w'),h:document.getElementById('h'),fontSize:document.getElementById('fontSize'),fontWeight:document.getElementById('fontWeight'),maxLines:document.getElementById('maxLines'),align:document.getElementById('align')};
    function ensureFieldOptions(){ controls.fieldKey.innerHTML=fieldList.map(f=>'<option value="'+f+'">'+f+'</option>').join(''); }
    function boxToStyle(box){ return 'left:'+(box.x||0)+'px;top:'+(box.y||0)+'px;width:'+(box.width||120)+'px;height:'+(box.height||40)+'px;font-size:'+(box.fontSize||18)+'px;font-weight:'+(box.fontWeight||700)+';text-align:'+(box.align||'left')+';'; }
    function render(){ ensureFieldOptions(); [...stage.querySelectorAll('.field')].forEach(el=>el.remove()); Object.entries(fields).forEach(([key,box])=>{ const el=document.createElement('div'); el.className='field'+(selected===key?' selected':''); el.dataset.key=key; el.style.cssText=boxToStyle(box); el.innerHTML='<div class="tag">'+key+'</div><div class="value" style="-webkit-line-clamp:'+(box.maxLines||2)+'">'+(sampleData[key]||key)+'</div><div class="resize"></div>'; el.onmousedown=(e)=>startDrag(e,key,e.target.classList.contains('resize')?'resize':'move'); stage.appendChild(el); }); syncControls(); if(!previewFrame.srcdoc) refreshPreview(); }
    function syncControls(){ const box=fields[selected]; const disabled=!box; Object.entries(controls).forEach(([k,el])=>{ el.disabled=disabled; if(!disabled && k!=='fieldKey') el.value=box[k] ?? ''; }); controls.fieldKey.value=selected || fieldList[0]; }
    function applyControlChange(){ if(!selected || !fields[selected]) return; const box=fields[selected]; box.x=Number(controls.x.value||0); box.y=Number(controls.y.value||0); box.width=Math.max(40,Number(controls.w.value||120)); box.height=Math.max(20,Number(controls.h.value||40)); box.fontSize=Math.max(10,Number(controls.fontSize.value||18)); box.fontWeight=Math.max(400,Number(controls.fontWeight.value||700)); box.maxLines=Math.max(1,Number(controls.maxLines.value||2)); box.align=controls.align.value; render(); }
    Object.values(controls).forEach(el=>el.oninput=applyControlChange);
    controls.fieldKey.onchange=()=>{ if(!selected) return; fields[controls.fieldKey.value]=fields[selected]; if(controls.fieldKey.value!==selected) delete fields[selected]; selected=controls.fieldKey.value; render(); };
    function startDrag(e,key,mode){ selected=key; const rect=stage.getBoundingClientRect(); const startX=e.clientX, startY=e.clientY; const start={...fields[key]}; drag={key,mode,rect,startX,startY,start}; window.addEventListener('mousemove',move); window.addEventListener('mouseup',up); render(); e.preventDefault(); }
    function move(e){ if(!drag) return; const dx=(e.clientX-drag.startX)*(stage.offsetWidth/drag.rect.width); const dy=(e.clientY-drag.startY)*(stage.offsetHeight/drag.rect.height); const box=fields[drag.key]; if(drag.mode==='move'){ box.x=Math.max(0,Math.round(drag.start.x+dx)); box.y=Math.max(0,Math.round(drag.start.y+dy)); } else { box.width=Math.max(40,Math.round(drag.start.width+dx)); box.height=Math.max(20,Math.round(drag.start.height+dy)); } render(); }
    function up(){ drag=null; window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); }
    async function refreshPreview(){ const res=await fetch('/memo/template/'+pageId+'/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mapping:fields})}); const data=await res.json(); previewFrame.srcdoc=data.previewHtml || '<html><body>Preview unavailable</body></html>'; }
    async function save(confirm){ const res=await fetch('/memo/template/'+pageId+'/mapping',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({mapping:fields,confirm})}); if(!res.ok){ alert('Save failed'); return; } if(confirm){ await fetch('/memo/template/'+pageId+'/confirm',{method:'POST'}); alert('Template saved and confirmed'); } else { alert('Draft saved'); } }
    document.getElementById('saveBtn').onclick=()=>save(false); document.getElementById('doneBtn').onclick=()=>save(true); document.getElementById('previewBtn').onclick=()=>refreshPreview(); document.getElementById('addFieldBtn').onclick=()=>{ const next=fieldList.find(k=>!fields[k]) || ('field'+Date.now()); fields[next]={x:60,y:60,width:220,height:50,fontSize:18,fontWeight:700,maxLines:2,align:'left'}; selected=next; render(); }; document.getElementById('deleteBtn').onclick=()=>{ if(selected){ delete fields[selected]; selected=null; render(); } }; stage.onclick=()=>{selected=null; render();}; render();
    </script></body></html>`;
  }

  buildSingleMemoHtml(
    order: MemoOrderData | null,
    business: BusinessInfo,
    theme: MemoTheme = 'classic',
    layout: MemoLayout = 'memo',
    uploadedTemplate?: UploadedMemoTemplate | null,
  ) {
    if (!order)
      return `<div class="memo-slot"><div class="blank-slot"></div></div>`;
    if (uploadedTemplate?.renderMode === 'background-mapped')
      return this.buildMappedTemplateHtml(order, business, uploadedTemplate);
    if ((uploadedTemplate?.renderMode as any) === 'pdf-overlay')
      return this.buildMappedTemplateHtml(order, business, uploadedTemplate!);
    if (uploadedTemplate?.renderMode === 'html-template')
      return this.buildHtmlTemplateMemo(order, business, uploadedTemplate);

    const t = this.themeService.getTheme(theme, business.primaryColor);
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal = items.reduce(
      (sum, item) =>
        sum + this.safeNumber(item.qty) * this.safeNumber(item.unitPrice),
      0,
    );
    const delivery = this.resolveDeliveryFee(order, business);
    const total = subtotal + delivery;
    const badge = layout === 'invoice' ? 'INVOICE' : 'MEMO';
    const currency = business.currencySymbol || '৳';
    const companyName = business.companyName || 'Business Name';
    const businessPhone = business.phone || '-';
    const businessAddress = business.address || '-';
    const customerName = order.customerName || '-';
    const customerPhone = order.phone || '-';
    const customerAddress = order.address || '-';
    const initials =
      companyName
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0] || '')
        .join('')
        .toUpperCase() || 'BZ';
    const logoHtml = business.logoUrl
      ? `<div class="logo"><img src="${this.escapeAttr(business.logoUrl)}" alt="logo" onerror="this.parentElement.classList.add('logo-hidden');this.remove();" /></div>`
      : `<div class="logo"><span class="logo-placeholder">${this.escape(initials)}</span></div>`;
    const rows = items.length
      ? items
          .map(
            (item) =>
              `<tr><td class="code-cell">${this.escape(item.productCode || '-')}</td><td class="number">${this.safeNumber(item.qty)}</td><td class="number">${this.money(this.safeNumber(item.unitPrice), currency)}</td><td class="number">${this.money(this.safeNumber(item.qty) * this.safeNumber(item.unitPrice), currency)}</td></tr>`,
          )
          .join('')
      : `<tr class="empty-row"><td colspan="4">No item added</td></tr>`;
    return `<div class="memo-slot"><div class="memo-card"><div class="memo-header">${logoHtml}<div class="company-block"><h1>${this.escape(companyName)}</h1><div class="company-meta"><div>${this.escape(businessPhone)}</div><div>${this.escape(businessAddress)}</div></div></div><div class="memo-badge">${badge}</div></div><div class="memo-body"><div class="meta-row"><div><span class="section-title">Order ID</span><br/>#${order.id || '-'}</div><div style="text-align:right"><span class="section-title">Date</span><br/>${this.escape(this.formatDate(order.createdAt))}</div></div><div class="dual-box"><div class="business-box"><div class="section-title">Business</div><div><b>Name:</b> ${this.escape(companyName)}</div><div><b>Phone:</b> ${this.escape(businessPhone)}</div></div><div class="customer-box"><div class="section-title">Customer</div><div><b>Name:</b> ${this.escape(customerName)}</div><div><b>Phone:</b> ${this.escape(customerPhone)}</div></div></div><div class="customer-box"><div class="section-title">Address</div><div class="field-value field-address">${this.escape(customerAddress)}</div></div><table><thead><tr><th>Code</th><th class="number">Qty</th><th class="number">Price</th><th class="number">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals-box"><div class="totals-row"><span>Subtotal</span><span>${this.money(subtotal, currency)}</span></div><div class="totals-row"><span>Delivery Fee</span><span>${this.money(delivery, currency)}</span></div><div class="totals-row cod"><span>${this.escape(business.codLabel || 'COD')}</span><span>${this.money(total, currency)}</span></div><div class="totals-row total"><span>Total</span><span>${this.money(total, currency)}</span></div></div></div><div class="memo-footer">${this.escape(business.footerText || 'Thank you for your order')}</div></div></div>`;
  }

  private buildMappedTemplateHtml(
    order: MemoOrderData,
    business: BusinessInfo,
    template: UploadedMemoTemplate,
  ) {
    const sample = this.buildSampleDataFromOrder(order, business);
    return `<div class="memo-slot"><div class="uploaded-template-wrap">${this.buildPreviewOverlay(template, sample, false)}</div></div>`;
  }

  private buildHtmlTemplateMemo(
    order: MemoOrderData,
    business: BusinessInfo,
    template: UploadedMemoTemplate,
  ) {
    const sample = this.buildSampleDataFromOrder(order, business);
    const rendered = this.renderHtmlTemplate(
      template.htmlContent || template.extractedText || '',
      sample,
    );
    return `<div class="memo-slot html-template-wrap"><iframe class="html-template-doc" srcdoc="${this.escapeAttr(rendered)}"></iframe></div>`;
  }

  private renderHtmlTemplate(html: string, sampleData: MemoPreviewData) {
    let out =
      html ||
      '<html><body><div>{{customerName}}</div><div>{{customerPhone}}</div><div>{{customerAddress}}</div></body></html>';
    for (const [key, value] of Object.entries(sampleData)) {
      const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      out = out.replace(re, this.escape(value));
    }
    return out;
  }

  private buildPreviewOverlay(
    template: UploadedMemoTemplate,
    sampleData: MemoPreviewData,
    withLabels: boolean,
  ) {
    const mapping = template.mapping || {};
    const width = Number(template.templateWidth || 1200);
    const height = Number(template.templateHeight || 1800);
    const mappedHtml = Object.entries(sampleData)
      .filter(([key]) => Boolean((mapping as any)[key]))
      .map(([key, value]) =>
        this.renderMappedField(
          (mapping as any)[key],
          value,
          width,
          height,
          key,
          withLabels,
        ),
      )
      .join('');
    // pdf-overlay: use <embed> as background (PDF rendered by browser)
    if ((template.renderMode as any) === 'pdf-overlay') {
      return `<embed class="uploaded-template-bg bg" src="${this.escapeAttr(template.fileUrl)}" type="application/pdf" /><div class="mapped-layer layer">${mappedHtml}</div>`;
    }
    return `<img class="uploaded-template-bg bg" src="${this.escapeAttr(template.fileUrl)}" alt="template" /><div class="mapped-layer layer">${mappedHtml}</div>`;
  }

  private renderMappedField(
    box: any,
    value: string,
    baseWidth: number,
    baseHeight: number,
    key: string,
    withLabels = false,
  ) {
    const left = this.toPercent(box?.x, baseWidth);
    const top = this.toPercent(box?.y, baseHeight);
    const width = this.toPercent(box?.width, baseWidth);
    const isAddress = key === 'customerAddress';
    const fontSize = Math.max(Number(box?.fontSize || 18), isAddress ? 14 : 13);
    const fontWeight = Number(box?.fontWeight || 700);
    const maxLines = Number(box?.maxLines || (isAddress ? 6 : 2));
    const lineHeight = 1.4;

    // Address: auto-expand height so long text never clips; other fields: fixed height
    let heightStyle: string;
    if (isAddress) {
      const minH = this.toPercent(box?.height, baseHeight);
      const computedMinPx = Math.round(fontSize * maxLines * lineHeight + 8);
      const computedMinPct = this.toPercent(computedMinPx, baseHeight);
      heightStyle = `min-height:${Math.max(minH, computedMinPct).toFixed(3)}%;height:auto;`;
    } else {
      heightStyle = `height:${this.toPercent(box?.height, baseHeight)}%;`;
    }

    // Address: allow full text to flow without line-clamp; others: clamp
    let inner: string;
    if (key === 'items') {
      inner = `<div class="mapped-items field-value" style="-webkit-line-clamp:${maxLines};line-height:${lineHeight};">${this.escape(value)}</div>`;
    } else if (isAddress) {
      // No line-clamp for address — let it wrap fully
      inner = `<div class="field-address-mapped" style="line-height:${lineHeight};overflow-wrap:anywhere;word-break:break-word;white-space:normal;">${this.escape(value)}</div>`;
    } else {
      inner = `<div class="field-value" style="-webkit-line-clamp:${maxLines};line-height:${lineHeight};">${this.escape(value)}</div>`;
    }

    const label = withLabels
      ? `<div class="label">${this.escape(key)}</div>`
      : '';
    return `<div class="mapped-field box" data-key="${this.escapeAttr(key)}" data-align="${this.escapeAttr(box?.align || 'left')}" style="left:${left}%;top:${top}%;width:${width}%;${heightStyle}font-size:${fontSize}px;font-weight:${fontWeight};">${label}${inner}</div>`;
  }

  private buildSampleDataFromOrder(
    order: MemoOrderData,
    business: BusinessInfo,
  ): MemoPreviewData {
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal = items.reduce(
      (sum, item) =>
        sum + this.safeNumber(item.qty) * this.safeNumber(item.unitPrice),
      0,
    );
    const delivery = this.resolveDeliveryFee(order, business);
    const total = subtotal + delivery;
    const currency = business.currencySymbol || '৳';
    return {
      customerName: order.customerName || '-',
      customerPhone: order.phone || '-',
      customerAddress: order.address || '-',
      orderId: `#${order.id || '-'}`,
      date: this.formatDate(order.createdAt),
      businessName: business.companyName || '-',
      businessPhone: business.phone || '-',
      codAmount: this.money(total, currency),
      totalAmount: this.money(total, currency),
      deliveryFee: this.money(delivery, currency),
      items: items.length
        ? items
            .map(
              (item) =>
                `${item.productCode || '-'} x${this.safeNumber(item.qty)} = ${this.money(this.safeNumber(item.qty) * this.safeNumber(item.unitPrice), currency)}`,
            )
            .join(' | ')
        : 'No item added',
    };
  }

  private toPercent(value: number, total: number) {
    const safeValue = this.safeNumber(value);
    const safeTotal = Math.max(this.safeNumber(total), 1);
    return Number(((safeValue / safeTotal) * 100).toFixed(3));
  }
  private resolveDeliveryFee(order: MemoOrderData, business: BusinessInfo) {
    const address = String(order.address || '').toLowerCase();
    const isDhaka = address.includes('dhaka') || address.includes('ঢাকা');
    return isDhaka
      ? this.safeNumber(business.deliveryFeeInsideDhaka)
      : this.safeNumber(business.deliveryFeeOutsideDhaka);
  }
  private formatDate(value?: string) {
    try {
      const d = value ? new Date(value) : new Date();
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('bn-BD', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '-';
    }
  }
  private safeNumber(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  private money(value: number, currency = '৳') {
    const safe = this.safeNumber(value);
    return `${currency}${safe.toFixed(0)}`;
  }
  private escape(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  private escapeAttr(value: unknown) {
    return this.escape(value);
  }
  private escapeForScript(value: string) {
    return value.replace(/</g, '\\u003c');
  }
}
