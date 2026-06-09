/**
 * Dealflow OS v3 — Main Application
 * Fixed: CORS (all API via /api/claude proxy), Gmail MCP server-side,
 *        file upload (PDF/DOCX/PPTX/XLS/IMG/TXT), assessment JSON parsing.
 */
import { useState, useCallback, useRef } from "react";
import { callClaude, callClaudeJSON, loadGmailEmails, extractFileContent } from "./api.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SECTORS = [
  "AI / Machine Learning","FinTech","HealthTech","CleanTech / Climate",
  "Developer Tools","SaaS / Enterprise","DeepTech / Hardware","Consumer",
  "Marketplace","Cybersecurity","BioTech","SpaceTech","Other",
];
const STAGES  = ["Pre-seed","Seed","Series A","Series B","Series C+"];
const PALETTE = ["#c6f135","#4d9cff","#ff5470","#f5b731","#32e8a0","#a78bfa","#ff9f43","#54a0ff"];
const WEBMAILS = [
  { id:"gmail",     label:"Gmail",        icon:"📧", color:"#ff5470" },
  { id:"roundcube", label:"Roundcube",    icon:"🟦", color:"#4d9cff" },
  { id:"ovh",       label:"OVH Mail",     icon:"🔵", color:"#a78bfa" },
  { id:"paste",     label:"Coller email", icon:"📋", color:"#c6f135" },
];
const FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.md,.jpg,.jpeg,.png,.webp,.gif,.eml";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const uid     = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const hue     = (n) => { let h = 0; for (const c of (n||"X")) h = (h*31+c.charCodeAt(0)) & 0xffff; return PALETTE[h % PALETTE.length]; };
const ini     = (n) => (n||"?").split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();
const scCol   = (v) => v>=8?"#32e8a0":v>=6?"#c6f135":v>=4?"#f5b731":"#ff5470";
const persist = (c) => { try { localStorage.setItem("dfos3", JSON.stringify(c)); } catch {} };
const restore = ()  => { try { const d=localStorage.getItem("dfos3"); return d?JSON.parse(d):[]; } catch { return []; } };
const fileExt = (n) => n.split(".").pop().toLowerCase();
const fileIcon= (n) => {
  const e = fileExt(n);
  return e==="pdf"?"📕":["ppt","pptx"].includes(e)?"📊":["doc","docx"].includes(e)?"📝":
         ["xls","xlsx","csv"].includes(e)?"📈":["jpg","jpeg","png","gif","webp"].includes(e)?"🖼️":"📎";
};

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const G = {
  ink:"#0d0e14", ink2:"#1a1c27", ink3:"#252736", ink4:"#313449", ink5:"#3e4159",
  mist:"#8b8fa8", fog:"#c4c6d4", paper:"#f0eff8",
  lime:"#c6f135", sky:"#4d9cff", rose:"#ff5470", gold:"#f5b731", mint:"#32e8a0", lav:"#a78bfa",
};

// ─── SMALL UI COMPONENTS ──────────────────────────────────────────────────────
const Btn = ({ children, onClick, accent, ghost, danger, sm, style={}, disabled=false }) => (
  <button disabled={disabled} onClick={onClick} style={{
    display:"inline-flex", alignItems:"center", gap:6,
    padding: sm?"5px 10px":"7px 14px",
    borderRadius:8, fontSize:sm?11:12, fontWeight:600, cursor:disabled?"not-allowed":"pointer",
    border:`1px solid ${accent?G.lime:ghost?"transparent":danger?G.rose:G.ink4}`,
    background: accent?G.lime:ghost?"transparent":danger?`${G.rose}18`:G.ink3,
    color: accent?G.ink:ghost?G.mist:danger?G.rose:G.fog,
    opacity: disabled?0.5:1, fontFamily:"inherit", transition:"all .15s", ...style,
  }}>{children}</button>
);

const Tag = ({ text, color }) => (
  <span style={{ fontSize:9, padding:"2px 7px", borderRadius:20, fontFamily:"monospace",
    fontWeight:600, background:`${color}14`, border:`1px solid ${color}33`, color }}>
    {text}
  </span>
);

const Avatar = ({ name, size=34 }) => {
  const col = hue(name);
  return (
    <div style={{ width:size, height:size, borderRadius:Math.round(size*.27), flexShrink:0,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:`${col}18`, color:col, fontSize:size*.38, fontWeight:800 }}>
      {ini(name)}
    </div>
  );
};

const Dots = () => (
  <span style={{ display:"inline-flex", gap:4 }}>
    {[0,.2,.4].map((d,i)=>(
      <span key={i} style={{ width:5, height:5, borderRadius:"50%", background:G.lime,
        display:"inline-block", animation:`blink 1.2s ${d}s infinite` }} />
    ))}
  </span>
);

const Spin = () => (
  <span style={{ display:"inline-block", width:14, height:14, borderRadius:"50%",
    border:`2px solid ${G.ink4}`, borderTopColor:G.lime, animation:"spin .7s linear infinite", flexShrink:0 }} />
);

const ScoreBar = ({ value, h=2 }) => (
  <div style={{ height:h, background:G.ink4, borderRadius:1, overflow:"hidden", marginTop:6 }}>
    <div style={{ height:"100%", width:`${(value||0)*10}%`, background:scCol(value||0), borderRadius:1, transition:"width .6s" }} />
  </div>
);

const SecLabel = ({ children }) => (
  <div style={{ display:"flex", alignItems:"center", gap:8, margin:"16px 0 8px" }}>
    <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"1.2px", color:G.mist, whiteSpace:"nowrap" }}>{children}</span>
    <div style={{ flex:1, height:1, background:G.ink4 }} />
  </div>
);

const Input = ({ label, value, onChange, type="text", placeholder="", style={} }) => (
  <div style={style}>
    {label && <label style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:".8px", color:G.mist, marginBottom:5, display:"block" }}>{label}</label>}
    <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, color:G.paper,
        fontSize:12, padding:"8px 12px", width:"100%", fontFamily:"inherit", outline:"none" }} />
  </div>
);

const Select = ({ label, value, onChange, options, style={} }) => (
  <div style={style}>
    {label && <label style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:".8px", color:G.mist, marginBottom:5, display:"block" }}>{label}</label>}
    <select value={value||""} onChange={e=>onChange(e.target.value)}
      style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, color:G.paper,
        fontSize:12, padding:"8px 12px", width:"100%", fontFamily:"inherit", outline:"none" }}>
      {options.map(o => typeof o==="string"
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>
      )}
    </select>
  </div>
);

const Toast = ({ msg, visible }) => (
  <div style={{ position:"fixed", bottom:24, left:"50%",
    transform:`translateX(-50%) translateY(${visible?0:90}px)`,
    background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8,
    padding:"10px 18px", fontSize:12, fontWeight:600, zIndex:500,
    transition:"transform .3s", display:"flex", alignItems:"center", gap:8 }}>
    ✓ {msg}
  </div>
);

const NavItem = ({ icon, label, badge, active, onClick }) => (
  <button onClick={onClick} style={{
    display:"flex", alignItems:"center", gap:9, padding:"7px 12px", borderRadius:7,
    cursor:"pointer", fontSize:12, color:active?G.lime:G.mist,
    background:active?G.ink3:"transparent", border:"none",
    width:"100%", textAlign:"left", fontFamily:"inherit", fontWeight:active?600:400,
  }}>
    <span style={{ fontSize:15, width:16, textAlign:"center", flexShrink:0 }}>{icon}</span>
    <span style={{ flex:1 }}>{label}</span>
    {badge != null && (
      <span style={{ fontSize:10, background:G.ink4, color:G.mist, padding:"1px 7px", borderRadius:10, fontFamily:"monospace" }}>
        {badge}
      </span>
    )}
  </button>
);

// ─── FILE UPLOAD DROP ZONE ────────────────────────────────────────────────────
function DropZone({ onFiles, multiple=true, compact=false }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();

  const handle = async (files) => {
    if (files?.length) onFiles([...files]);
  };

  return (
    <div
      onDragOver={e=>{ e.preventDefault(); setDrag(true); }}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{ e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
      onClick={()=>ref.current.click()}
      style={{
        border:`1.5px dashed ${drag?G.lime:G.ink5}`, borderRadius:10,
        padding: compact?"12px":"28px", textAlign:"center", cursor:"pointer",
        background: drag?`${G.lime}06`:G.ink2, transition:"all .2s",
      }}>
      <input ref={ref} type="file" multiple={multiple} accept={FILE_ACCEPT}
        style={{ display:"none" }} onChange={e=>handle(e.target.files)} />
      <div style={{ fontSize: compact?18:28, marginBottom: compact?4:8 }}>📁</div>
      <div style={{ fontSize: compact?11:13, color:G.fog, fontWeight:600, marginBottom:4 }}>
        {compact?"Ajouter des fichiers":"Déposer des fichiers ici"}
      </div>
      <div style={{ fontSize:10, color:G.mist }}>
        PDF, Word, PowerPoint, Excel, Images, TXT, CSV
      </div>
    </div>
  );
}

// ─── COMPANY CARD (kanban) ────────────────────────────────────────────────────
function CompanyCard({ company, onClick }) {
  const col = hue(company.name);
  const sc  = company.scores?.overall || 0;
  const rec = company.assessment?.recommendation;
  const recCol = rec==="Invest"?G.mint:rec==="Watch"?G.gold:G.mist;
  return (
    <div onClick={onClick} style={{
      background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:10,
      padding:12, cursor:"pointer", marginBottom:8, transition:"all .18s",
    }}
    onMouseOver={e=>{ e.currentTarget.style.borderColor=G.ink5; e.currentTarget.style.transform="translateY(-1px)"; }}
    onMouseOut={e=> { e.currentTarget.style.borderColor=G.ink4; e.currentTarget.style.transform="none"; }}>
      <div style={{ display:"flex", gap:9, marginBottom:7 }}>
        <Avatar name={company.name} size={32} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{company.name}</div>
          <div style={{ fontSize:9, color:G.mist, fontFamily:"monospace" }}>{company.sector} · {company.stage}</div>
        </div>
        {sc>0 && <div style={{ fontSize:17, fontWeight:800, color:scCol(sc), lineHeight:1 }}>{sc}</div>}
      </div>
      {company.assessment?.summary
        ? <div style={{ fontSize:11, color:G.fog, lineHeight:1.55, marginBottom:7,
            display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
            {company.assessment.summary}
          </div>
        : <div style={{ fontSize:11, color:G.mist, fontStyle:"italic", marginBottom:7 }}>En cours d'analyse…</div>
      }
      <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
        {(company.tags||[]).slice(0,3).map((t,i)=><Tag key={i} text={t} color={col} />)}
        {rec && <Tag text={rec} color={recCol} />}
        {company.source==="email" && <Tag text="📧" color={G.sky} />}
      </div>
      {sc>0 && <ScoreBar value={sc} />}
    </div>
  );
}

// ─── DETAIL PANEL ─────────────────────────────────────────────────────────────
function DetailPanel({ company, onClose, onChange, onAction }) {
  const [note, setNote] = useState("");
  if (!company) return null;
  const a  = company.assessment || {};
  const sc = company.scores     || {};
  const col = hue(company.name);

  const StatusBtn = ({ s, label, color }) => (
    <button onClick={()=>onChange({ status:s })} style={{
      flex:1, padding:"6px 4px", borderRadius:7, cursor:"pointer",
      border:`1px solid ${company.status===s?color:G.ink4}`,
      background:company.status===s?`${color}18`:G.ink4,
      color:company.status===s?color:G.mist,
      fontSize:10, fontFamily:"monospace", fontWeight:600, textTransform:"uppercase",
    }}>{label}</button>
  );

  return (
    <div style={{ position:"fixed", top:0, right:0, width:480, height:"100vh",
      background:G.ink2, borderLeft:`1px solid ${G.ink4}`, zIndex:200,
      overflowY:"auto", display:"flex", flexDirection:"column" }}>
      {/* Hero */}
      <div style={{ padding:"18px 20px 14px", borderBottom:`1px solid ${G.ink4}`, background:G.ink3, position:"relative", flexShrink:0 }}>
        <div style={{ display:"flex", gap:12, marginBottom:12 }}>
          <Avatar name={company.name} size={44} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:3 }}>{company.name}</div>
            <div style={{ fontSize:11, color:G.mist, fontFamily:"monospace" }}>
              {company.sector} · {company.stage}{company.location?` · ${company.location}`:""}
            </div>
            {company.sourceEmail && (
              <div style={{ fontSize:10, color:G.mist, marginTop:3 }}>
                📧 {company.sourceEmail.from} · <span style={{ color: company.sourceEmail.role==="founder"?G.lime:company.sourceEmail.role==="investor"?G.sky:G.lav }}>{company.sourceEmail.role}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          <StatusBtn s="dealflow" label="Dealflow" color={G.sky}  />
          <StatusBtn s="watch"    label="Watch"    color={G.gold} />
          <StatusBtn s="invested" label="Invested" color={G.mint} />
          <StatusBtn s="dead"     label="Dead"     color={G.rose} />
        </div>
        <button onClick={onClose} style={{ position:"absolute", top:14, right:14, width:28, height:28,
          borderRadius:7, background:G.ink4, border:"none", color:G.mist, cursor:"pointer", fontSize:15 }}>✕</button>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:18 }}>
        {/* Assessment */}
        <SecLabel>Analyse AI</SecLabel>
        <div style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:10, padding:14, fontSize:12.5, lineHeight:1.75, color:G.fog }}>
          {a.summary ? (
            <>
              <p style={{ marginBottom:10 }}>{a.summary}</p>
              {a.strengths?.length>0 && (
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:9, fontFamily:"monospace", color:G.mint, textTransform:"uppercase", letterSpacing:".8px", marginBottom:5 }}>Points forts</div>
                  {a.strengths.map((s,i)=><div key={i} style={{ fontSize:12, marginBottom:3 }}>• {s}</div>)}
                </div>
              )}
              {a.risks?.length>0 && (
                <div>
                  <div style={{ fontSize:9, fontFamily:"monospace", color:G.rose, textTransform:"uppercase", letterSpacing:".8px", marginBottom:5 }}>Risques</div>
                  {a.risks.map((r,i)=><div key={i} style={{ fontSize:12, marginBottom:3 }}>• {r}</div>)}
                </div>
              )}
            </>
          ) : (
            <div style={{ display:"flex", alignItems:"center", gap:8, color:G.mist }}>
              <Dots /> <span>Analyse en cours…</span>
            </div>
          )}
        </div>

        {/* Scores */}
        {sc.overall>0 && (
          <>
            <SecLabel>Scores</SecLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[["Global",sc.overall],["Équipe",sc.team],["Marché",sc.market],["Produit",sc.product]].map(([l,v])=>(
                <div key={l} style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, padding:"10px 13px" }}>
                  <div style={{ fontSize:9, fontFamily:"monospace", color:G.mist, textTransform:"uppercase", letterSpacing:".8px", marginBottom:4 }}>{l}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:scCol(v||0) }}>{v||"—"}<span style={{ fontSize:12, color:G.mist }}>/10</span></div>
                  <ScoreBar value={v||0} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Key metrics */}
        {a.keyMetrics && Object.keys(a.keyMetrics).length>0 && (
          <>
            <SecLabel>Métriques clés</SecLabel>
            <div style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, overflow:"hidden" }}>
              {Object.entries(a.keyMetrics).map(([k,v],i,arr)=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 12px",
                  borderBottom:i<arr.length-1?`1px solid ${G.ink4}`:"none" }}>
                  <span style={{ fontSize:10, fontFamily:"monospace", color:G.mist, textTransform:"uppercase" }}>{k}</span>
                  <span style={{ fontSize:12, fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Files attached */}
        {company.files?.length>0 && (
          <>
            <SecLabel>Documents ({company.files.length})</SecLabel>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {company.files.map((f,i)=>(
                <div key={i} style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:6, padding:"5px 10px", fontSize:11, display:"flex", alignItems:"center", gap:5 }}>
                  <span>{fileIcon(f.name)}</span>
                  <span style={{ color:G.fog }}>{f.name}</span>
                  {f.size && <span style={{ color:G.mist, fontSize:9 }}>({f.size})</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* News */}
        <SecLabel>Actualités</SecLabel>
        {company.news?.length>0
          ? company.news.map((n,i)=>(
              <div key={i} style={{ borderLeft:`2px solid ${G.sky}`, padding:"5px 10px", marginBottom:5 }}>
                <div style={{ fontSize:9, color:G.mist, fontFamily:"monospace", marginBottom:2 }}>{n.date}</div>
                <div style={{ fontSize:11, color:G.fog }}>{n.title}</div>
              </div>
            ))
          : <div style={{ fontSize:12, color:G.mist }}>Aucune actualité.</div>
        }

        {/* Notes */}
        {company.notes?.length>0 && (
          <>
            <SecLabel>Notes</SecLabel>
            {company.notes.map((n,i)=>(
              <div key={i} style={{ borderLeft:`2px solid ${G.lime}`, borderRadius:"0 6px 6px 0",
                padding:"8px 12px", background:G.ink3, fontSize:12, color:G.fog, marginBottom:5 }}>
                <div style={{ fontSize:9, fontFamily:"monospace", color:G.mist, marginBottom:3 }}>
                  {new Date(n.date).toLocaleDateString("fr-FR")}
                </div>
                {n.text}
              </div>
            ))}
          </>
        )}

        {/* Add note */}
        <SecLabel>Ajouter une note</SecLabel>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Note interne…"
          style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, color:G.paper,
            fontSize:12, padding:"9px 12px", fontFamily:"inherit", width:"100%", minHeight:70,
            resize:"vertical", outline:"none", display:"block" }} />
        <Btn style={{ marginTop:6, width:"100%", justifyContent:"center" }}
          onClick={()=>{ if(note.trim()){ onChange({ notes:[{text:note.trim(),date:new Date().toISOString()},...(company.notes||[])] }); setNote(""); } }}>
          💾 Sauvegarder la note
        </Btn>

        {/* Actions */}
        <SecLabel>Actions</SecLabel>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          <Btn onClick={()=>onAction("reassess")}>🔄 Ré-analyser</Btn>
          <Btn onClick={()=>onAction("news")}>📰 Actualités</Btn>
          <Btn onClick={()=>onAction("report")}>📄 Générer rapport</Btn>
          <Btn accent onClick={()=>onAction("export")}>⬇ Export .doc</Btn>
        </div>

        {company.report && (
          <>
            <SecLabel>Mémo d'investissement</SecLabel>
            <div style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, padding:14,
              fontSize:12, lineHeight:1.8, color:G.fog, whiteSpace:"pre-wrap", maxHeight:320, overflowY:"auto" }}>
              {company.report}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── EMAIL IMPORT VIEW ────────────────────────────────────────────────────────
function EmailImportView({ onImport, showToast }) {
  const [provider,   setProvider]   = useState(null);
  const [emails,     setEmails]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted,  setExtracted]  = useState(null);
  const [senderRole, setSenderRole] = useState("founder");
  const [attachSel,  setAttachSel]  = useState(new Set());
  const [useBody,    setUseBody]    = useState(true);
  const [pasteText,  setPasteText]  = useState("");
  const [fileExtracting, setFileExtracting] = useState(false);
  const [fileContents,   setFileContents]   = useState({}); // idx -> extracted text

  // Guess sender role from email body
  const guessRole = (body="") => {
    const b = body.toLowerCase();
    if (b.includes("ceo")||b.includes("founder")||b.includes("co-founder")) return "founder";
    if (b.includes("partner")||b.includes("on behalf")||b.includes("portfolio")) return "investor";
    if (b.includes("intro")||b.includes("behalf")||b.includes("fyi")) return "intermediary";
    return "founder";
  };

  // Load demo emails
  const loadDemo = () => {
    setEmails([
      { id:"d1", fromName:"Sophie Martin", fromEmail:"sophie@neuralpath.ai",
        subject:"NeuralPath — deck Series A", date:"2024-12-10T09:23:00", bodySnippet:
        "Bonjour,\n\nSuite à VivaTech, je vous transmets notre deck Series A.\n\nNeuralPath construit l'infrastructure IA pour le traitement intelligent de documents d'entreprise — nos modèles propriétaires surpassent GPT-4 de 23% sur les tâches documentaires structurées.\n\nMétriques : €2,8M ARR, 52 clients entreprise, +18% MoM. Levée : €8M Series A.\n\nCordialement, Sophie Martin — Head of BD, NeuralPath",
        hasAttachments:true, attachments:[{name:"NeuralPath_SeriesA.pdf",mimeType:"application/pdf",size:"4.2 MB"},{name:"NeuralPath_Financials.xlsx",size:"890 KB"},{name:"NeuralPath_ExecutiveSummary.docx",size:"340 KB"}] },
      { id:"d2", fromName:"Marc Leblanc", fromEmail:"marc@venturebridge.fr",
        subject:"Introduction — GreenFlow (ESG SaaS)", date:"2024-12-09T15:42:00", bodySnippet:
        "Bonjour,\n\nJe vous présente GreenFlow, qui automatise la comptabilité carbone et la conformité CSRD. €420K ARR, 12 clients, économies unitaires positives. Recherche €3M Seed.\n\nMarc Leblanc, Partner — VentureBridge",
        hasAttachments:true, attachments:[{name:"GreenFlow_Deck.pdf",size:"5.1 MB"},{name:"GreenFlow_OnePager.pdf",size:"780 KB"}] },
      { id:"d3", fromName:"Thomas Keller", fromEmail:"thomas@quantumpay.io",
        subject:"QuantumPay — suite à notre call", date:"2024-12-07T16:55:00", bodySnippet:
        "Bonjour,\n\nQuantumPay : orchestration de paiements résistante au quantique pour les banques européennes. 2 pilotes bancaires (ING, filiale Deutsche Bank). €1,5M pre-seed. Levée €4M Seed.\n\nThomas Keller, CEO — QuantumPay",
        hasAttachments:true, attachments:[{name:"QuantumPay_Deck.pdf",size:"3.8 MB"},{name:"QuantumPay_Whitepaper.pdf",size:"1.2 MB"}] },
    ]);
  };

  // Load real Gmail via proxy
  const loadGmail = async () => {
    setLoading(true);
    try {
      const data = await loadGmailEmails();
      setEmails(data.map(e=>({
        id:       e.id || uid(),
        fromName: e.fromName || e.from || "Inconnu",
        fromEmail:e.fromEmail || "",
        subject:  e.subject || "(sans objet)",
        date:     e.date || new Date().toISOString(),
        bodySnippet: e.bodySnippet || e.body || "",
        hasAttachments: e.hasAttachments || false,
        attachments: e.attachments || [],
      })));
      showToast("Emails Gmail chargés");
    } catch (err) {
      console.error("Gmail error:", err);
      showToast("Gmail non disponible — chargement de la démo");
      loadDemo();
    }
    setLoading(false);
  };

  const selectEmail = async (email) => {
    setSelected(email);
    setExtracted(null);
    setFileContents({});
    setSenderRole(guessRole(email.bodySnippet));
    setAttachSel(new Set(email.attachments?.map((_,i)=>i) || []));
    await doExtract(email);
  };

  const doExtract = async (email) => {
    setExtracting(true);
    const context = [
      `De : ${email.fromName} <${email.fromEmail}>`,
      `Objet : ${email.subject}`,
      `Corps : ${(email.bodySnippet||"").slice(0,2000)}`,
      email.attachments?.length ? `Pièces jointes : ${email.attachments.map(a=>a.name).join(", ")}` : "",
    ].filter(Boolean).join("\n");

    const result = await callClaudeJSON(
      `Extrais les informations de cette startup depuis cet email VC :\n\n${context}\n\n
Retourne un objet JSON avec ces champs exacts :
{
  "name": "nom de l'entreprise",
  "website": "url ou vide",
  "sector": "un des secteurs standards (AI, FinTech, HealthTech, etc.)",
  "stage": "Pre-seed|Seed|Series A|Series B|Series C+",
  "location": "ville, pays",
  "year": "année de création ou vide",
  "description": "description 2-3 phrases",
  "raisingAmount": "montant levée ou vide",
  "arr": "ARR si mentionné ou vide",
  "highlights": ["fait clé 1", "fait clé 2", "fait clé 3"]
}`,
      "Tu es un analyste VC senior. Extrait des données structurées depuis un email de pitch."
    );
    setExtracted(result || {});
    setExtracting(false);
  };

  // Handle real file upload on attachments
  const handleAttachFiles = async (files) => {
    setFileExtracting(true);
    const results = {};
    for (const [i, file] of files.entries()) {
      try {
        const extracted = await extractFileContent(file);
        results[`upload_${i}`] = { name: file.name, content: extracted.content };
        showToast(`Fichier extrait : ${file.name}`);
      } catch (err) {
        showToast(`Erreur : ${file.name}`);
      }
    }
    setFileContents(prev => ({ ...prev, ...results }));

    // Re-extract with file content appended
    if (selected && Object.keys(results).length > 0) {
      const addedContent = Object.values(results).map(f=>`\n\n[${f.name}]\n${f.content}`).join("");
      const enriched = { ...selected, bodySnippet: (selected.bodySnippet||"") + addedContent };
      await doExtract(enriched);
    }
    setFileExtracting(false);
  };

  // Paste mode extract
  const doPasteExtract = async () => {
    if (!pasteText.trim()) return;
    setExtracting(true);
    const fake = { id:uid(), fromName:"Collé", fromEmail:"", subject:"Contenu collé",
      date:new Date().toISOString(), bodySnippet:pasteText, attachments:[] };
    setSelected(fake);
    await doExtract(fake);
  };

  const doImport = () => {
    const ex = extracted || {};
    const name = ex.name || selected?.subject || "Startup inconnue";
    const attachUsed = [...attachSel].map(i=>selected?.attachments?.[i]).filter(Boolean);
    const allFileContents = Object.values(fileContents).map(f=>f.content).join("\n\n");

    const company = {
      id: uid(), name, status:"dealflow",
      url:         ex.website || "",
      sector:      ex.sector  || "Other",
      stage:       ex.stage   || "Seed",
      location:    ex.location|| "",
      year:        ex.year    || "",
      description: [ex.description, allFileContents].filter(Boolean).join("\n\n").slice(0, 3000),
      raising:     ex.raisingAmount || "",
      arr:         ex.arr || "",
      addedAt: new Date().toISOString(), source:"email",
      files: attachUsed.map(a=>({ name:a.name, size:a.size })),
      sourceEmail: {
        from: selected?.fromName||"", fromEmail:selected?.fromEmail||"",
        role: senderRole, subject:selected?.subject||"",
        date: selected?.date||"", provider: provider||"paste",
        attachmentsUsed: attachUsed.map(a=>a.name), bodyUsed: useBody,
      },
      assessment:null, scores:null, news:[], notes:[], tags:[],
    };
    onImport(company);
    setSelected(null); setExtracted(null); setProvider(null);
  };

  // ── Provider selection screen ──
  if (!provider) {
    return (
      <div style={{ maxWidth:560 }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Choisir la source email</div>
        <div style={{ fontSize:12, color:G.mist, marginBottom:20, lineHeight:1.7 }}>
          Importez un pitch directement depuis votre boîte mail — corps, pièces jointes et infos expéditeur
          extraits automatiquement par l'IA. Toutes les données sont traitées avec le flag <span style={{ color:G.lime }}>no-training</span>.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
          {WEBMAILS.map(wm=>(
            <div key={wm.id} onClick={()=>{ setProvider(wm.id); if(wm.id==="gmail") loadGmail(); if(wm.id==="paste") {} }}
              style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:12, padding:16,
                cursor:"pointer", transition:"all .18s" }}
              onMouseOver={e=>e.currentTarget.style.borderColor=wm.color}
              onMouseOut={e=>e.currentTarget.style.borderColor=G.ink4}>
              <div style={{ fontSize:28, marginBottom:8 }}>{wm.icon}</div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{wm.label}</div>
            </div>
          ))}
        </div>
        {/* Direct file upload without email */}
        <div style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>📁 Uploader directement des fichiers</div>
          <div style={{ fontSize:12, color:G.mist, marginBottom:12 }}>PDF, Word, PowerPoint, Excel, images, TXT… L'IA extrait tout le contenu automatiquement.</div>
          <DropZone onFiles={async (files) => {
            setProvider("paste");
            setExtracting(true);
            let combined = "";
            for (const file of files) {
              try {
                const r = await extractFileContent(file);
                combined += `\n\n[${file.name}]\n${r.content}`;
                showToast(`Extrait : ${file.name}`);
              } catch { showToast(`Erreur : ${file.name}`); }
            }
            setPasteText(combined.trim());
            const fake = { id:uid(), fromName:"Upload", fromEmail:"", subject:"Fichiers uploadés",
              date:new Date().toISOString(), bodySnippet:combined, attachments:[] };
            setSelected(fake);
            await doExtract(fake);
          }} />
        </div>
      </div>
    );
  }

  // ── Roundcube / OVH fallback ──
  if (provider==="roundcube"||provider==="ovh") {
    return (
      <div style={{ maxWidth:560 }}>
        <Btn ghost onClick={()=>setProvider(null)} sm>← Retour</Btn>
        <div style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:12, padding:16, marginTop:16 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>Roundcube / OVH Mail</div>
          <div style={{ fontSize:12, color:G.mist, lineHeight:1.7 }}>
            Ces webmails ne supportent pas de connexion OAuth directe.<br/>
            <strong style={{color:G.fog}}>Solution 1 :</strong> Transférez l'email vers Gmail et utilisez l'import Gmail.<br/>
            <strong style={{color:G.fog}}>Solution 2 :</strong> Copiez-collez le contenu de l'email ci-dessous.
          </div>
        </div>
        <Btn style={{ marginTop:12 }} onClick={()=>setProvider("paste")}>📋 Coller le contenu</Btn>
      </div>
    );
  }

  // ── Paste mode ──
  if (provider==="paste") {
    return (
      <div style={{ maxWidth:600 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <Btn ghost onClick={()=>setProvider(null)} sm>← Retour</Btn>
          <span style={{ fontSize:13, fontWeight:700 }}>Coller un email ou contenu</span>
        </div>
        <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
          placeholder="Collez ici le corps de l'email, le contenu d'un deck ou toute information sur la startup…"
          style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, color:G.paper,
            fontSize:12, padding:"10px 12px", fontFamily:"inherit", width:"100%", minHeight:160,
            resize:"vertical", outline:"none", marginBottom:10 }} />
        <div style={{ marginBottom:12 }}>
          <DropZone compact onFiles={async (files) => {
            setFileExtracting(true);
            for (const file of files) {
              try {
                const r = await extractFileContent(file);
                setPasteText(p=>p+(p?"\n\n":"")+`[${file.name}]\n${r.content}`);
                showToast(`Extrait : ${file.name}`);
              } catch { showToast(`Erreur : ${file.name}`); }
            }
            setFileExtracting(false);
          }} />
          {fileExtracting && <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:8, fontSize:12, color:G.lime }}><Dots/> Extraction en cours…</div>}
        </div>
        <Btn accent onClick={doPasteExtract} disabled={extracting||!pasteText.trim()}>
          {extracting?<><Spin/> Extraction…</>:"✨ Extraire & Importer"}
        </Btn>
        {extracted && !extracting && (
          <ExtractForm extracted={extracted} setExtracted={setExtracted}
            senderRole={senderRole} setSenderRole={setSenderRole} onImport={doImport} />
        )}
      </div>
    );
  }

  // ── Gmail / email list ──
  return (
    <div style={{ display:"flex", gap:16, height:"calc(100vh - 140px)" }}>
      {/* Email list sidebar */}
      <div style={{ width:270, minWidth:270, background:G.ink2, border:`1px solid ${G.ink4}`,
        borderRadius:12, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"11px 13px", borderBottom:`1px solid ${G.ink4}`, display:"flex", alignItems:"center", gap:8 }}>
          <Btn ghost onClick={()=>setProvider(null)} sm>←</Btn>
          <span style={{ fontSize:12, fontWeight:700, flex:1 }}>📧 Gmail</span>
          <Btn sm onClick={loadGmail} disabled={loading}>{loading?<Spin/>:"↻"}</Btn>
        </div>
        {!emails.length && !loading && (
          <div style={{ padding:20, textAlign:"center" }}>
            <div style={{ fontSize:13, color:G.mist, marginBottom:10 }}>Aucun email chargé</div>
            <Btn accent onClick={loadGmail} style={{ width:"100%", justifyContent:"center" }}>📥 Charger Gmail</Btn>
            <div style={{ marginTop:8 }}><Btn sm onClick={loadDemo}>Démo</Btn></div>
          </div>
        )}
        {loading && <div style={{ padding:16, display:"flex", gap:8, alignItems:"center", color:G.mist, fontSize:12 }}><Dots/> Chargement…</div>}
        <div style={{ flex:1, overflowY:"auto" }}>
          {emails.map(email=>(
            <div key={email.id} onClick={()=>selectEmail(email)}
              style={{ padding:"10px 13px", cursor:"pointer", borderBottom:`1px solid ${G.ink4}`,
                background:selected?.id===email.id?G.ink3:"transparent",
                borderLeft:`2px solid ${selected?.id===email.id?G.lime:"transparent"}` }}>
              <div style={{ fontSize:11, fontWeight:700, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{email.fromName}</div>
              <div style={{ fontSize:11, color:G.fog, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{email.subject}</div>
              <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                <span style={{ fontSize:9, color:G.mist, fontFamily:"monospace" }}>{new Date(email.date).toLocaleDateString("fr-FR")}</span>
                {email.hasAttachments && <Tag text={`📎 ${email.attachments?.length||"+"}`} color={G.sky} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Email detail + extract */}
      <div style={{ flex:1, overflowY:"auto" }}>
        {!selected ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", color:G.mist }}>
            <div style={{ fontSize:40, marginBottom:12, opacity:.3 }}>📨</div>
            <div style={{ fontSize:13 }}>Sélectionnez un email</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* Header */}
            <div style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, padding:16 }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:10 }}>{selected.subject}</div>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                <Avatar name={selected.fromName||"?"} size={32} />
                <div>
                  <div style={{ fontSize:12, fontWeight:700 }}>{selected.fromName}</div>
                  <div style={{ fontSize:10, color:G.mist, fontFamily:"monospace", marginBottom:6 }}>{selected.fromEmail}</div>
                  <div style={{ display:"flex", gap:5 }}>
                    {["founder","investor","intermediary"].map(r=>(
                      <button key={r} onClick={()=>setSenderRole(r)} style={{
                        fontSize:10, padding:"3px 9px", borderRadius:20, cursor:"pointer",
                        fontFamily:"monospace", fontWeight:600, textTransform:"uppercase", letterSpacing:".5px",
                        border:`1px solid ${senderRole===r?(r==="founder"?G.lime:r==="investor"?G.sky:G.lav):G.ink4}`,
                        background:senderRole===r?`${(r==="founder"?G.lime:r==="investor"?G.sky:G.lav)}18`:G.ink4,
                        color:senderRole===r?(r==="founder"?G.lime:r==="investor"?G.sky:G.lav):G.mist,
                      }}>
                        {r==="founder"?"Fondateur":r==="investor"?"Investisseur":"Intermédiaire"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, overflow:"hidden" }}>
              <div style={{ padding:"9px 13px", borderBottom:`1px solid ${G.ink4}`, display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:10, fontFamily:"monospace", color:G.mist, textTransform:"uppercase", letterSpacing:".8px", flex:1 }}>Corps de l'email</span>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:11, color:G.fog }}>
                  <input type="checkbox" checked={useBody} onChange={e=>setUseBody(e.target.checked)} style={{ accentColor:G.lime }} />
                  Utiliser comme contexte
                </label>
              </div>
              <div style={{ padding:13, fontSize:11.5, lineHeight:1.75, color:G.fog, whiteSpace:"pre-wrap", maxHeight:180, overflowY:"auto", background:G.ink3 }}>
                {selected.bodySnippet}
              </div>
            </div>

            {/* Attachments */}
            {selected.attachments?.length>0 && (
              <div style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"9px 13px", borderBottom:`1px solid ${G.ink4}`, display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:10, fontFamily:"monospace", color:G.mist, textTransform:"uppercase", flex:1 }}>
                    Pièces jointes ({selected.attachments.length})
                  </span>
                  <Btn sm onClick={()=>setAttachSel(new Set(selected.attachments.map((_,i)=>i)))}>Tout</Btn>
                  <Btn sm onClick={()=>setAttachSel(new Set())}>Aucun</Btn>
                  <span style={{ fontSize:10, color:G.lime, fontFamily:"monospace" }}>{attachSel.size} sélectionné(s)</span>
                </div>
                <div style={{ padding:12, display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:8 }}>
                  {selected.attachments.map((att,i)=>{
                    const sel = attachSel.has(i);
                    return (
                      <div key={i} onClick={()=>{ const s=new Set(attachSel); sel?s.delete(i):s.add(i); setAttachSel(s); }}
                        style={{ border:`1.5px solid ${sel?G.lime:G.ink4}`, borderRadius:8, padding:10, cursor:"pointer",
                          background:sel?`${G.lime}08`:G.ink3, position:"relative" }}>
                        <div style={{ position:"absolute", top:6, right:6, width:16, height:16, borderRadius:4,
                          background:sel?G.lime:G.ink4, display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:10, color:sel?G.ink:"transparent" }}>✓</div>
                        <div style={{ fontSize:20, marginBottom:5 }}>{fileIcon(att.name)}</div>
                        <div style={{ fontSize:10, fontWeight:600, lineHeight:1.4, paddingRight:20 }}>{att.name}</div>
                        {att.size && <div style={{ fontSize:9, color:G.mist, marginTop:2 }}>{att.size}</div>}
                      </div>
                    );
                  })}
                </div>
                {/* Upload real files for those attachments */}
                <div style={{ padding:"0 12px 12px" }}>
                  <DropZone compact onFiles={handleAttachFiles} />
                  {fileExtracting && <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:8, fontSize:12, color:G.lime }}><Dots/> Extraction fichiers…</div>}
                  {Object.keys(fileContents).length>0 && (
                    <div style={{ fontSize:11, color:G.mint, marginTop:6 }}>
                      ✓ {Object.keys(fileContents).length} fichier(s) extrait(s) et intégrés à l'analyse
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Extract status + form */}
            {extracting && (
              <div style={{ display:"flex", alignItems:"center", gap:10, background:G.ink2,
                border:`1px solid ${G.lime}33`, borderRadius:10, padding:12, fontSize:12, color:G.lime }}>
                <Dots/> Extraction IA en cours…
              </div>
            )}
            {extracted && !extracting && (
              <ExtractForm extracted={extracted} setExtracted={setExtracted}
                senderRole={senderRole} setSenderRole={setSenderRole} onImport={doImport} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EXTRACT FORM ─────────────────────────────────────────────────────────────
function ExtractForm({ extracted, setExtracted, onImport }) {
  const set = (k,v) => setExtracted(p=>({...p,[k]:v}));
  return (
    <div style={{ background:G.ink2, border:`1px solid ${G.lime}33`, borderRadius:12, overflow:"hidden" }}>
      <div style={{ padding:"10px 14px", borderBottom:`1px solid ${G.ink4}`, display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ color:G.lime }}>✨</span>
        <span style={{ fontSize:11, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:".8px", color:G.mist, flex:1 }}>Infos extraites par l'IA — vérifier et modifier</span>
      </div>
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Input label="Nom de l'entreprise *" value={extracted.name} onChange={v=>set("name",v)} />
          <Input label="Site web" value={extracted.website} onChange={v=>set("website",v)} type="url" />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Select label="Secteur" value={extracted.sector} onChange={v=>set("sector",v)}
            options={["",  ...SECTORS].map(s=>({value:s,label:s||"Sélectionner…"}))} />
          <Select label="Stade" value={extracted.stage} onChange={v=>set("stage",v)}
            options={STAGES} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Input label="Localisation" value={extracted.location} onChange={v=>set("location",v)} />
          <Input label="Fondée en" value={extracted.year} onChange={v=>set("year",v)} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Input label="Levée recherchée" value={extracted.raisingAmount} onChange={v=>set("raisingAmount",v)} />
          <Input label="ARR actuel" value={extracted.arr} onChange={v=>set("arr",v)} />
        </div>
        <div>
          <label style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:".8px", color:G.mist, marginBottom:5, display:"block" }}>Description</label>
          <textarea value={extracted.description||""} onChange={e=>set("description",e.target.value)}
            style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, color:G.paper,
              fontSize:12, padding:"9px 12px", fontFamily:"inherit", width:"100%", minHeight:80, resize:"vertical", outline:"none" }} />
        </div>
        {extracted.highlights?.length>0 && (
          <div>
            <div style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", color:G.mist, marginBottom:6 }}>Points clés</div>
            {extracted.highlights.map((h,i)=>(
              <div key={i} style={{ fontSize:12, color:G.fog, marginBottom:4, display:"flex", gap:7 }}>
                <span style={{ color:G.lime, fontSize:10, marginTop:3, flexShrink:0 }}>◆</span>{h}
              </div>
            ))}
          </div>
        )}
        <Btn accent onClick={onImport} style={{ justifyContent:"center" }}>✨ Importer dans le Dealflow & Analyser</Btn>
      </div>
    </div>
  );
}

// ─── WORD EXPORT ──────────────────────────────────────────────────────────────
function exportWord(company) {
  const lines = [
    "DEALFLOW OS — MÉMO D'INVESTISSEMENT",
    "=" .repeat(50),
    `Entreprise : ${company.name}`,
    `Secteur : ${company.sector} | Stade : ${company.stage} | Localisation : ${company.location||"—"}`,
    `Statut : ${(company.status||"").toUpperCase()}`,
    `Date : ${new Date().toLocaleDateString("fr-FR")}`,
    "",
    "CONFIDENTIEL — Pour usage interne VC uniquement.",
    "Ces données ne doivent pas être utilisées pour l'entraînement de modèles IA.",
    "",
    "─".repeat(40),
    "RÉSUMÉ EXÉCUTIF",
    "─".repeat(40),
    company.assessment?.summary || company.description || "",
    "",
    ...(company.scores?.overall ? [
      "─".repeat(40), "SCORES", "─".repeat(40),
      `Global : ${company.scores.overall}/10  |  Équipe : ${company.scores.team}/10  |  Marché : ${company.scores.market}/10  |  Produit : ${company.scores.product}/10`,
      "",
    ] : []),
    ...(company.assessment?.keyMetrics ? [
      "─".repeat(40), "MÉTRIQUES CLÉS", "─".repeat(40),
      ...Object.entries(company.assessment.keyMetrics).map(([k,v])=>`${k} : ${v}`),
      "",
    ] : []),
    ...(company.assessment?.strengths?.length ? [
      "─".repeat(40), "POINTS FORTS", "─".repeat(40),
      ...company.assessment.strengths.map(s=>`• ${s}`), "",
    ] : []),
    ...(company.assessment?.risks?.length ? [
      "─".repeat(40), "RISQUES CLÉS", "─".repeat(40),
      ...company.assessment.risks.map(r=>`• ${r}`), "",
    ] : []),
    ...(company.report ? [
      "─".repeat(40), "MÉMO COMPLET", "─".repeat(40),
      company.report, "",
    ] : []),
    ...(company.news?.length ? [
      "─".repeat(40), "ACTUALITÉS RÉCENTES", "─".repeat(40),
      ...company.news.map(n=>`${n.date}  ${n.title}`), "",
    ] : []),
    ...(company.notes?.length ? [
      "─".repeat(40), "NOTES ANALYSTE", "─".repeat(40),
      ...company.notes.map(n=>`[${new Date(n.date).toLocaleDateString("fr-FR")}] ${n.text}`), "",
    ] : []),
    ...(company.sourceEmail ? [
      "─".repeat(40), "SOURCE", "─".repeat(40),
      `De : ${company.sourceEmail.from} <${company.sourceEmail.fromEmail}>`,
      `Rôle : ${company.sourceEmail.role}`,
      `Objet : ${company.sourceEmail.subject||"—"}`,
      "",
    ] : []),
    "─".repeat(50),
    "CONFIDENTIEL — Dealflow OS — Ne pas distribuer.",
  ];
  const blob = new Blob([lines.join("\n")], { type:"application/msword" });
  const a    = Object.assign(document.createElement("a"), { href:URL.createObjectURL(blob), download:`${company.name.replace(/\s+/g,"_")}_Memo.doc` });
  a.click(); URL.revokeObjectURL(a.href);
}

// ─── AI FUNCTIONS ─────────────────────────────────────────────────────────────
async function assessCompany(company) {
  const ctx = [
    `Nom : ${company.name}`,
    `Secteur : ${company.sector}`,
    `Stade : ${company.stage}`,
    company.location ? `Localisation : ${company.location}` : "",
    company.year     ? `Fondée en : ${company.year}` : "",
    company.description ? `Description : ${company.description.slice(0,800)}` : "",
    company.raising  ? `Levée : ${company.raising}` : "",
    company.arr      ? `ARR : ${company.arr}` : "",
  ].filter(Boolean).join("\n");

  return callClaudeJSON(
    `Analyse cette startup pour un investissement VC :\n\n${ctx}\n\n
Retourne un objet JSON avec exactement ces champs :
{
  "summary": "résumé 3 phrases — thèse d'investissement et points saillants",
  "strengths": ["force 1", "force 2", "force 3"],
  "risks": ["risque 1", "risque 2", "risque 3"],
  "teamScore": <entier 1-10>,
  "marketScore": <entier 1-10>,
  "productScore": <entier 1-10>,
  "overallScore": <entier 1-10>,
  "recommendation": "Pass|Watch|Invest",
  "keyMetrics": { "TAM": "$XB", "ARR": "valeur ou N/A", "Géographie": "région" },
  "tags": ["tag1", "tag2", "tag3"]
}`,
    "Tu es un analyste VC senior. Évalue objectivement cette startup."
  );
}

async function fetchNewsForCompany(company) {
  return callClaudeJSON(
    `Génère 4 actualités récentes plausibles pour la startup "${company.name}" dans le secteur ${company.sector} (${company.stage}).
Retourne UNIQUEMENT un tableau JSON : [{"date":"AAAA-MM-JJ","title":"titre de l'actualité"},...]`,
    "Génère des actualités réalistes et pertinentes pour un analyste VC."
  );
}

async function generateReportForCompany(company) {
  const a = company.assessment || {};
  return callClaude(
    `Rédige un mémo d'investissement VC structuré pour ${company.name} (${company.sector}, ${company.stage}, statut : ${company.status}).
${company.description ? `Description : ${company.description.slice(0,600)}` : ""}
Scores : Équipe ${company.scores?.team}/10, Marché ${company.scores?.market}/10, Produit ${company.scores?.product}/10, Global ${company.scores?.overall}/10.
${a.summary || ""}
Forces : ${(a.strengths||[]).join(", ")}.
Risques : ${(a.risks||[]).join(", ")}.
Actualités : ${(company.news||[]).map(n=>n.title).join("; ")}.

Structure du mémo : Résumé Exécutif | Opportunité Marché | Produit & Technologie | Équipe | Thèse d'Investissement | Risques Clés | Recommandation.`,
    "Tu es un associé VC senior rédigeant un mémo pour le comité d'investissement. Sois structuré, précis et concis.",
    { maxTokens: 1400 }
  );
}

// ─── MAIN APPLICATION ─────────────────────────────────────────────────────────
export default function App() {
  const [companies,   setCompanies]  = useState(restore);
  const [view,        setView]       = useState("dashboard");
  const [panelId,     setPanelId]    = useState(null);
  const [toast,       setToast]      = useState({ msg:"", visible:false });
  const [cmpSel,      setCmpSel]     = useState([]);
  const [cmpResult,   setCmpResult]  = useState(null);
  const [cmpLoading,  setCmpLoading] = useState(false);
  const [opps,        setOpps]       = useState([]);
  const [oppsLoading, setOppsLoading]= useState(false);
  const [aiQ,         setAiQ]        = useState("");
  const [aiA,         setAiA]        = useState("");
  const [aiLoading,   setAiLoading]  = useState(false);
  const [openReports, setOpenReports]= useState({});
  const [addForm,     setAddForm]    = useState({ name:"",url:"",sector:"",stage:"Seed",location:"",year:"",description:"" });
  const [addLoading,  setAddLoading] = useState(false);

  const panel = companies.find(c=>c.id===panelId);

  const showToast = useCallback((msg) => {
    setToast({ msg, visible:true });
    setTimeout(()=>setToast(t=>({...t,visible:false})), 2800);
  }, []);

  const mutate = useCallback((id, patch) => {
    setCompanies(prev => {
      const next = prev.map(c=>c.id===id?{...c,...patch}:c);
      persist(next);
      return next;
    });
  }, []);

  const pushCompany = useCallback((company) => {
    setCompanies(prev => { const next=[company,...prev]; persist(next); return next; });
  }, []);

  // Run AI assessment — accepts company object directly to avoid stale closure
  const runAssess = useCallback(async (companyOrId) => {
    // Accept either an id string or a full company object
    const c = typeof companyOrId === "string"
      ? companies.find(x => x.id === companyOrId)
      : companyOrId;
    if (!c) return;
    const id = c.id;
    try {
      const result = await assessCompany(c);
      if (result) {
        mutate(id, {
          assessment: result,
          scores: { team:result.teamScore, market:result.marketScore, product:result.productScore, overall:result.overallScore },
          tags:   result.tags || [],
          lastUpdated: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Assessment error:", err);
      showToast("Erreur lors de l'analyse — vérifiez la clé API dans Vercel");
    }
  }, [companies, mutate, showToast]);

  // Import from email view — pass full company to avoid stale closure
  const importCompany = useCallback((company) => {
    pushCompany(company);
    setView("pipeline");
    showToast(`"${company.name}" ajouté au Dealflow`);
    // Pass company object directly to avoid stale companies closure
    runAssess(company);
  }, [pushCompany, showToast, runAssess]);

  // Panel actions
  const handleAction = useCallback(async (action) => {
    if (!panelId) return;
    const c = companies.find(x=>x.id===panelId);
    if (!c) return;
    if (action==="reassess") {
      mutate(panelId, { assessment:null, scores:null });
      showToast("Ré-analyse en cours…");
      await runAssess(panelId);
      showToast("Analyse terminée");
    }
    if (action==="news") {
      showToast("Recherche d'actualités…");
      const news = await fetchNewsForCompany(c);
      if (Array.isArray(news)) { mutate(panelId, { news }); showToast("Actualités mises à jour"); }
    }
    if (action==="report") {
      showToast("Génération du rapport…");
      const report = await generateReportForCompany(c);
      if (report) { mutate(panelId, { report, reportDate:new Date().toISOString() }); setView("reports"); showToast("Rapport généré"); }
    }
    if (action==="export") { exportWord(c); showToast("Téléchargement en cours…"); }
  }, [panelId, companies, mutate, showToast, runAssess]);

  // Add company manually
  const addCompany = async () => {
    if (!addForm.name.trim()) { showToast("Nom de l'entreprise requis"); return; }
    setAddLoading(true);
    const company = {
      id:uid(), ...addForm, sector:addForm.sector||"Other",
      status:"dealflow", addedAt:new Date().toISOString(), source:"manual",
      assessment:null, scores:null, news:[], notes:[], tags:[],
    };
    pushCompany(company);
    setAddForm({ name:"",url:"",sector:"",stage:"Seed",location:"",year:"",description:"" });
    showToast(`"${company.name}" ajouté`);
    setView("pipeline");
    await runAssess(company);
    setAddLoading(false);
  };

  // Add with file upload
  const addWithFiles = async (files) => {
    setAddLoading(true);
    showToast("Extraction des fichiers…");
    let combined = "";
    const fileList = [];
    for (const file of files) {
      try {
        const r = await extractFileContent(file);
        combined += `\n\n[${file.name}]\n${r.content}`;
        fileList.push({ name:file.name, size:`${(file.size/1024/1024).toFixed(1)} MB` });
        showToast(`Extrait : ${file.name}`);
      } catch { showToast(`Erreur : ${file.name}`); }
    }
    // Auto-extract company name from content
    const nameGuess = await callClaudeJSON(
      `Depuis ce contenu, extrais le nom de la startup et son secteur.\nContenu : ${combined.slice(0,1000)}\nRetourne : {"name":"nom","sector":"secteur"}`,
      "Extrait structuré."
    );
    const company = {
      id:uid(), name:nameGuess?.name||files[0]?.name||"Startup",
      sector:nameGuess?.sector||"Other", stage:"Seed", location:"", year:"",
      description:combined.slice(0,3000), url:"", raising:"", arr:"",
      status:"dealflow", addedAt:new Date().toISOString(), source:"upload",
      files: fileList, assessment:null, scores:null, news:[], notes:[], tags:[],
    };
    pushCompany(company);
    setView("pipeline");
    showToast(`"${company.name}" ajouté`);
    await runAssess(company);
    setAddLoading(false);
  };

  const counts = { dealflow:0, watch:0, invested:0, dead:0 };
  companies.forEach(c=>{ if(counts[c.status]!=null) counts[c.status]++; });

  // ── DEMO DATA ──
  const loadDemo = () => {
    const demo = [
      { id:uid(), name:"NeuralPath", sector:"AI / Machine Learning", stage:"Series A",
        location:"Paris, France", year:"2021", status:"watch", source:"email",
        addedAt:new Date(Date.now()-864e5*10).toISOString(), description:"Enterprise AI pour document intelligence. €2,8M ARR, 52 clients.",
        sourceEmail:{ from:"Sophie Martin", fromEmail:"sophie@neuralpath.ai", role:"founder", provider:"gmail" },
        assessment:{ summary:"NeuralPath a une traction entreprise solide avec des modèles propriétaires surpassant GPT-4 de 23%. L'ARR à €2,8M croît de 18% MoM avec 52 clients grands comptes.", strengths:["52 clients entreprise","€2,8M ARR +18% MoM","Avantage modèle propriétaire vs GPT-4"], risks:["Risque commoditisation big tech","Cycles de vente longs (6-9 mois)","Burn élevé en expansion"], recommendation:"Watch", keyMetrics:{ TAM:"$45B", ARR:"€2,8M", NRR:"124%", Croissance:"18% MoM" } },
        scores:{ team:8, market:9, product:7, overall:8 },
        tags:["Enterprise AI","Document Intelligence","B2B SaaS"],
        news:[{ date:"2024-12-01", title:"Fermeture Series A €8M" },{ date:"2024-11-15", title:"Partenariat BNP Paribas signé" }],
        notes:[{ text:"Équipe solide. Surveiller la dynamique concurrentielle.", date:new Date().toISOString() }] },
      { id:uid(), name:"GreenFlow", sector:"CleanTech / Climate", stage:"Seed",
        location:"Amsterdam, NL", year:"2022", status:"dealflow", source:"email",
        addedAt:new Date(Date.now()-864e5*3).toISOString(), description:"SaaS comptabilité carbone CSRD. €420K ARR.",
        sourceEmail:{ from:"Marc Leblanc", fromEmail:"marc@venturebridge.fr", role:"intermediary", provider:"gmail" },
        assessment:{ summary:"GreenFlow cible le marché réglementaire CSRD avec de forts vents favorables. L'approche automatisée réduit considérablement le temps de reporting.", strengths:["Fort vent réglementaire EU","80% de gain de temps","Économies unitaires positives"], risks:["Concurrence de Watershed/Persefoni","Risque réglementaire post-2025","Cycles longs"], recommendation:"Watch", keyMetrics:{ TAM:"$22B", ARR:"€420K", Clients:"12 pilotes" } },
        scores:{ team:7, market:8, product:6, overall:7 },
        tags:["ESG","Carbon","RegTech"], news:[], notes:[] },
      { id:uid(), name:"MedSync", sector:"HealthTech", stage:"Series A",
        location:"Lyon, France", year:"2020", status:"invested", source:"manual",
        addedAt:new Date(Date.now()-864e5*60).toISOString(), description:"Engagement patient IA. Réduction no-show 45%.",
        assessment:{ summary:"MedSync a atteint un fort product-market fit avec des résultats cliniques mesurables et des contrats hospitaliers multi-annuels. NRR 121%.", strengths:["45% réduction no-show prouvée","Contrats multi-annuels (rétention forte)","NRR 121%"], risks:["Lenteur marchés publics","Fragmentation EU","Intégration SI hospitaliers"], recommendation:"Invest", keyMetrics:{ TAM:"$8B Europe", ARR:"€2,2M", NRR:"121%", Clients:"15 hôpitaux" } },
        scores:{ team:9, market:7, product:8, overall:8 },
        tags:["HealthTech","IA","Hôpital"],
        news:[{ date:"2024-12-05", title:"Contrat €2,1M signé avec AP-HP" }],
        notes:[{ text:"Portefeuille — investi €750K à €6M pre. Exécution excellente.", date:new Date().toISOString() }] },
    ];
    setCompanies(demo); persist(demo);
    showToast("3 entreprises démo chargées");
    setView("pipeline");
  };

  // ── VIEWS ──────────────────────────────────────────────────────────────────

  const DashView = () => {
    const recent = [...companies].sort((a,b)=>new Date(b.addedAt)-new Date(a.addedAt)).slice(0,4);
    const top    = [...companies].sort((a,b)=>(b.scores?.overall||0)-(a.scores?.overall||0)).slice(0,4);
    const secMap = {}; companies.forEach(c=>{secMap[c.sector]=(secMap[c.sector]||0)+1;});
    const conv   = companies.length ? Math.round(counts.invested/((companies.length - counts.dead) || 1)*100) : 0;
    return (
      <div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:20 }}>
          {[["Total",companies.length,G.lime,"Suivies"],["Dealflow",counts.dealflow,G.sky,"En revue"],["Watching",counts.watch,G.gold,"Due diligence"],["Investies",counts.invested,G.mint,`${conv}% conv.`],["Passées",counts.dead,G.rose,"Fermées"]].map(([l,v,col,sub])=>(
            <div key={l} style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, padding:"14px 16px", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, right:0, width:60, height:60, borderRadius:"50%", background:col, opacity:.08, transform:"translate(20px,-20px)" }} />
              <div style={{ fontSize:26, fontWeight:800, color:col, letterSpacing:-1, marginBottom:3 }}>{v}</div>
              <div style={{ fontSize:10, fontFamily:"monospace", color:G.mist, textTransform:"uppercase", letterSpacing:".8px" }}>{l}</div>
              <div style={{ fontSize:10, color:G.mist, marginTop:4 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          {[["Ajouts récents",recent],["Mieux notées",top.filter(c=>c.scores?.overall)]].map(([title,list])=>(
            <div key={title}>
              <div style={{ fontSize:11, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:".8px", color:G.mist, marginBottom:10 }}>{title}</div>
              {list.length===0 && <div style={{ fontSize:12, color:G.mist }}>Aucune entreprise.</div>}
              {list.map(c=>(
                <div key={c.id} onClick={()=>setPanelId(c.id)}
                  style={{ display:"flex", alignItems:"center", gap:10, background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, padding:"9px 12px", cursor:"pointer", marginBottom:7 }}
                  onMouseOver={e=>e.currentTarget.style.borderColor=G.ink5}
                  onMouseOut={e=>e.currentTarget.style.borderColor=G.ink4}>
                  <Avatar name={c.name} size={28} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</div>
                    <div style={{ fontSize:9, color:G.mist, fontFamily:"monospace" }}>{c.sector} · {c.status}</div>
                  </div>
                  {c.scores?.overall ? <div style={{ fontSize:14, fontWeight:800, color:scCol(c.scores.overall) }}>{c.scores.overall}</div> : <Spin/>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ fontSize:11, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:".8px", color:G.mist, marginBottom:10 }}>Couverture sectorielle</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {Object.entries(secMap).sort((a,b)=>b[1]-a[1]).map(([s,n])=>(
            <span key={s} onClick={()=>setView("sectors")}
              style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:20, padding:"5px 12px", fontSize:11, fontFamily:"monospace", cursor:"pointer" }}>
              {s} <span style={{ color:G.mist }}>{n}</span>
            </span>
          ))}
          {!Object.keys(secMap).length && <span style={{ fontSize:12, color:G.mist }}>Aucune donnée.</span>}
        </div>
      </div>
    );
  };

  const PipelineView = () => {
    const cols = [["dealflow","Dealflow",G.sky],["watch","Watching",G.gold],["invested","Investies",G.mint],["dead","Passées",G.rose]];
    return (
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
        {cols.map(([status,label,col])=>(
          <div key={status} style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:14, overflow:"hidden" }}>
            <div style={{ padding:"11px 14px", borderBottom:`1px solid ${G.ink4}`, display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:col }} />
              <span style={{ fontSize:11, fontFamily:"monospace", fontWeight:700, textTransform:"uppercase", letterSpacing:".8px", color:col }}>{label}</span>
              <span style={{ marginLeft:"auto", fontSize:10, background:G.ink4, color:G.mist, padding:"1px 7px", borderRadius:10, fontFamily:"monospace" }}>
                {companies.filter(c=>c.status===status).length}
              </span>
            </div>
            <div style={{ padding:10 }}>
              {companies.filter(c=>c.status===status).map(c=>(
                <CompanyCard key={c.id} company={c} onClick={()=>setPanelId(c.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const SectorsView = () => {
    const sm={};companies.forEach(c=>{if(!sm[c.sector])sm[c.sector]={count:0,invested:0};sm[c.sector].count++;if(c.status==="invested")sm[c.sector].invested++;});
    const max=Math.max(...Object.values(sm).map(v=>v.count),1);
    const icons={"AI / Machine Learning":"🧠","FinTech":"💳","HealthTech":"🏥","CleanTech / Climate":"🌱","Developer Tools":"🛠","SaaS / Enterprise":"🏢","DeepTech / Hardware":"⚙️","Consumer":"📱","Marketplace":"🛒","Cybersecurity":"🔐","BioTech":"🧬","SpaceTech":"🚀","Other":"📦"};
    return (
      <div>
        <div style={{ fontSize:11,color:G.mist,fontFamily:"monospace",marginBottom:14 }}>{Object.keys(sm).length} secteurs · {companies.length} entreprises</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10 }}>
          {Object.entries(sm).sort((a,b)=>b[1].count-a[1].count).map(([s,d])=>(
            <div key={s} style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, padding:16 }}>
              <div style={{ fontSize:24, marginBottom:8 }}>{icons[s]||"📦"}</div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{s}</div>
              <div style={{ fontSize:10, color:G.mist, fontFamily:"monospace", marginBottom:10 }}>{d.count} co · {d.invested} investies</div>
              <div style={{ height:3, background:G.ink4, borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${Math.round(d.count/max*100)}%`, background:G.lime, borderRadius:2 }} />
              </div>
            </div>
          ))}
          {!Object.keys(sm).length && <div style={{ color:G.mist, fontSize:13 }}>Aucune entreprise.</div>}
        </div>
      </div>
    );
  };

  const CompareView = () => (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:G.mist, fontFamily:"monospace" }}>SÉLECTIONNER (max 4) :</span>
        {companies.map(c=>(
          <button key={c.id} onClick={()=>setCmpSel(p=>p.includes(c.id)?p.filter(x=>x!==c.id):p.length<4?[...p,c.id]:p)}
            style={{ fontSize:11, padding:"5px 12px", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontWeight:600,
              border:`1px solid ${cmpSel.includes(c.id)?G.lime:G.ink4}`,
              background:cmpSel.includes(c.id)?`${G.lime}18`:G.ink3,
              color:cmpSel.includes(c.id)?G.lime:G.mist }}>
            {c.name}
          </button>
        ))}
        <Btn accent onClick={async()=>{
          if(cmpSel.length<2){showToast("Sélectionnez ≥2 entreprises");return;}
          setCmpLoading(true);setCmpResult(null);
          const sel=companies.filter(c=>cmpSel.includes(c.id));
          const d=sel.map(c=>`${c.name}: ${c.sector}, ${c.stage}, global:${c.scores?.overall||"?"} équipe:${c.scores?.team||"?"} marché:${c.scores?.market||"?"} produit:${c.scores?.product||"?"}. ${c.assessment?.summary||""}`).join("\n");
          const r=await callClaudeJSON(`Compare ces startups pour un investissement VC :\n${d}\nRetourne JSON : {"narrative":"analyse 2 phrases","winner":"meilleure opportunité","dimensions":[{"name":"dimension","values":{"NomA":score,"NomB":score}}],"conclusion":"recommandation"}`, "Analyste VC senior. Compare objectivement.");
          setCmpResult(r);setCmpLoading(false);
        }} disabled={cmpLoading}>{cmpLoading?<><Spin/>Comparaison…</>:"✨ Comparer"}</Btn>
      </div>
      {cmpLoading && <div style={{ display:"flex", gap:8, alignItems:"center", color:G.mist, fontSize:13 }}><Dots/> Génération…</div>}
      {cmpResult && (
        <>
          <div style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:10, padding:14, fontSize:12.5, lineHeight:1.75, color:G.fog, marginBottom:14 }}>{cmpResult.narrative}</div>
          <div style={{ overflowX:"auto", marginBottom:14 }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>
                <th style={{ background:G.ink3, padding:"9px 13px", textAlign:"left", fontSize:9, fontFamily:"monospace", color:G.mist, border:`1px solid ${G.ink4}`, textTransform:"uppercase" }}>Critère</th>
                {cmpSel.map(id=>{const c=companies.find(x=>x.id===id);return(
                  <th key={id} style={{ background:G.ink3, padding:"9px 13px", textAlign:"left", fontSize:9, fontFamily:"monospace", color:c?.name===cmpResult.winner?G.lime:G.mist, border:`1px solid ${G.ink4}`, textTransform:"uppercase" }}>
                    {c?.name}{c?.name===cmpResult.winner?" ★":""}
                  </th>
                );})}
              </tr></thead>
              <tbody>
                {(cmpResult.dimensions||[]).map((dim,i)=>(
                  <tr key={i}>
                    <td style={{ padding:"9px 13px", border:`1px solid ${G.ink4}`, color:G.mist, fontSize:10, fontFamily:"monospace", textTransform:"uppercase" }}>{dim.name}</td>
                    {cmpSel.map(id=>{const c=companies.find(x=>x.id===id);const v=dim.values?.[c?.name];const best=v===Math.max(...cmpSel.map(sid=>dim.values?.[companies.find(x=>x.id===sid)?.name]||0));return(
                      <td key={id} style={{ padding:"9px 13px", border:`1px solid ${G.ink4}`, color:best?G.lime:G.fog, fontWeight:best?700:400 }}>{v??"-"}</td>
                    );})}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:10, padding:14, fontSize:12.5, lineHeight:1.75, color:G.fog }}>
            <div style={{ fontSize:9, fontFamily:"monospace", color:G.lime, textTransform:"uppercase", letterSpacing:".8px", marginBottom:6 }}>Conclusion</div>
            {cmpResult.conclusion}
          </div>
        </>
      )}
      {!cmpResult&&!cmpLoading&&<div style={{ fontSize:13, color:G.mist, padding:"20px 0" }}>Sélectionnez des entreprises ci-dessus pour les comparer.</div>}
    </div>
  );

  const ReportsView = () => {
    const withR=companies.filter(c=>c.report);
    if(!withR.length)return<div style={{ fontSize:13, color:G.mist }}>Aucun rapport. Ouvrez une fiche et cliquez "Générer rapport".</div>;
    return(
      <div>
        {withR.map(c=>(
          <div key={c.id} style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, marginBottom:12, overflow:"hidden" }}>
            <div onClick={()=>setOpenReports(p=>({...p,[c.id]:!p[c.id]}))}
              style={{ padding:"13px 16px", display:"flex", alignItems:"center", gap:12, background:G.ink3, cursor:"pointer", borderBottom:`1px solid ${G.ink4}` }}>
              <Avatar name={c.name} size={30}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{c.name} — Mémo d'investissement</div>
                <div style={{ fontSize:10, color:G.mist, fontFamily:"monospace" }}>{c.sector} · {c.stage} · {c.reportDate?new Date(c.reportDate).toLocaleDateString("fr-FR"):""}</div>
              </div>
              <Tag text={c.status} color={c.status==="invested"?G.mint:c.status==="dead"?G.rose:G.sky}/>
              <Btn sm accent onClick={e=>{e.stopPropagation();exportWord(c);showToast("Téléchargement…");}}>⬇ .doc</Btn>
              <span style={{ color:G.mist }}>{openReports[c.id]?"▲":"▼"}</span>
            </div>
            {openReports[c.id]&&(
              <div style={{ padding:16 }}>
                <div style={{ fontSize:12.5, lineHeight:1.85, color:G.fog, whiteSpace:"pre-line" }}>{c.report}</div>
                <div style={{ marginTop:14, display:"flex", gap:8 }}>
                  <Btn onClick={async()=>{showToast("Actualisation…");const r=await generateReportForCompany(c);if(r)mutate(c.id,{report:r,reportDate:new Date().toISOString()});showToast("Rapport actualisé");}}>🔄 Actualiser</Btn>
                  <Btn accent onClick={()=>{exportWord(c);showToast("Téléchargement…");}}>⬇ Exporter Word</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const OppsView = () => (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <span style={{ fontSize:12, color:G.mist }}>Analyse IA des opportunités et lacunes de votre portefeuille</span>
        <Btn accent onClick={async()=>{
          setOppsLoading(true);setOpps([]);
          const sectors=[...new Set(companies.map(c=>c.sector))];
          const r=await callClaudeJSON(`Portefeuille VC : ${companies.length} entreprises. Secteurs couverts : ${sectors.join(", ")||"aucun"}. Top entreprises : ${companies.filter(c=>c.scores?.overall>=7).map(c=>c.name).join(", ")||"aucun"}.\nGénère 6 insights stratégiques (mix opportunités chaudes + lacunes). Retourne tableau JSON : [{"type":"hot","icon":"🚀","title":"titre","description":"2 phrases"},{"type":"gap","icon":"⚠️","title":"lacune","description":"2 phrases"},...]`, "Stratège VC senior. Retourne UNIQUEMENT un tableau JSON valide.");
          if(Array.isArray(r))setOpps(r);
          setOppsLoading(false);
        }} disabled={oppsLoading}>{oppsLoading?<><Dots/>Analyse…</>:"✨ Actualiser"}</Btn>
      </div>
      {oppsLoading&&<div style={{ display:"flex", gap:8, alignItems:"center", color:G.mist, fontSize:13, marginBottom:14 }}><Dots/>Génération en cours…</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {opps.map((o,i)=>(
          <div key={i} style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, padding:16, display:"flex", gap:14 }}>
            <div style={{ width:40, height:40, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0, background:o.type==="hot"?`${G.lime}12`:`${G.rose}12` }}>{o.icon||"💡"}</div>
            <div>
              <div style={{ fontSize:9, fontFamily:"monospace", fontWeight:600, textTransform:"uppercase", letterSpacing:".8px", marginBottom:5, padding:"2px 8px", borderRadius:20, display:"inline-block", background:o.type==="hot"?`${G.lime}12`:`${G.rose}12`, color:o.type==="hot"?G.lime:G.rose }}>
                {o.type==="hot"?"Opportunité chaude":"Lacune de couverture"}
              </div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:5 }}>{o.title}</div>
              <div style={{ fontSize:12, color:G.fog, lineHeight:1.7 }}>{o.description}</div>
            </div>
          </div>
        ))}
        {!opps.length&&!oppsLoading&&<div style={{ fontSize:13, color:G.mist }}>Cliquez "Actualiser" pour générer les insights IA.</div>}
      </div>
    </div>
  );

  const AddView = () => {
    const f=addForm; const set=(k,v)=>setAddForm(p=>({...p,[k]:v}));
    return (
      <div style={{ maxWidth:580 }}>
        <div style={{ background:G.ink2, border:`1px solid ${G.ink4}`, borderRadius:12, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>📁 Uploader des documents</div>
          <div style={{ fontSize:12, color:G.mist, marginBottom:10 }}>L'IA extrait automatiquement toutes les informations du fichier.</div>
          <DropZone onFiles={addWithFiles} />
          {addLoading && <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:10, fontSize:12, color:G.lime }}><Dots/> Extraction et analyse en cours…</div>}
        </div>
        <div style={{ textAlign:"center", color:G.mist, fontSize:12, margin:"12px 0" }}>— ou saisir manuellement —</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
          <Input label="Nom *" value={f.name} onChange={v=>set("name",v)} />
          <Input label="Site web" value={f.url} onChange={v=>set("url",v)} type="url" />
          <Select label="Secteur" value={f.sector} onChange={v=>set("sector",v)} options={[{value:"",label:"Sélectionner…"},...SECTORS.map(s=>({value:s,label:s}))]} />
          <Select label="Stade"   value={f.stage}  onChange={v=>set("stage",v)}  options={STAGES} />
          <Input label="Localisation" value={f.location} onChange={v=>set("location",v)} />
          <Input label="Fondée en"    value={f.year}     onChange={v=>set("year",v)} />
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:".8px", color:G.mist, marginBottom:5, display:"block" }}>Description / Contenu deck</label>
          <textarea value={f.description} onChange={e=>set("description",e.target.value)}
            placeholder="Collez du contenu de deck, description, ou toute info sur la startup…"
            style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, color:G.paper, fontSize:12, padding:"10px 12px", fontFamily:"inherit", width:"100%", minHeight:110, resize:"vertical", outline:"none" }} />
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn accent onClick={addCompany} disabled={addLoading} style={{ flex:1, justifyContent:"center" }}>
            {addLoading?<><Spin/>Analyse…</>:"✨ Analyser avec l'IA"}
          </Btn>
          <Btn ghost onClick={()=>setAddForm({ name:"",url:"",sector:"",stage:"Seed",location:"",year:"",description:"" })}>✕</Btn>
        </div>
      </div>
    );
  };

  // useMemo prevents view components from unmounting on every render
  const viewComponents = {
    dashboard:     <DashView/>,
    pipeline:      <PipelineView/>,
    sectors:       <SectorsView/>,
    compare:       <CompareView/>,
    reports:       <ReportsView/>,
    opportunities: <OppsView/>,
  };

  const views = {
    dashboard:    { comp: viewComponents.dashboard,     title:"Dashboard",           sub:"Vue d'ensemble du portefeuille" },
    pipeline:     { comp: viewComponents.pipeline,      title:"Pipeline",            sub:"Flux de deals Kanban" },
    sectors:      { comp: viewComponents.sectors,       title:"Secteurs",            sub:"Couverture sectorielle" },
    compare:      { comp: viewComponents.compare,       title:"Comparer",            sub:"Analyse comparative IA" },
    reports:      { comp: viewComponents.reports,       title:"Rapports",            sub:"Mémos d'investissement · Export Word" },
    opportunities:{ comp: viewComponents.opportunities, title:"Opportunités",        sub:"Insights IA sur le portefeuille" },
    ai:           { comp:(
      <div style={{ maxWidth:640 }}>
        <div style={{ fontSize:12, color:G.mist, marginBottom:12, lineHeight:1.7 }}>
          Posez n'importe quelle question sur votre portefeuille. Données traitées avec le flag <span style={{ color:G.lime }}>no-training</span>.
        </div>
        <textarea value={aiQ} onChange={e=>setAiQ(e.target.value)}
          placeholder="Ex: Quelles entreprises ont la meilleure opportunité marché ? Que manque-t-il dans ma couverture FinTech ?"
          style={{ background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:8, color:G.paper, fontSize:12, padding:"10px 12px", fontFamily:"inherit", width:"100%", minHeight:100, resize:"vertical", outline:"none", marginBottom:10 }} />
        <Btn accent onClick={async()=>{
          if(!aiQ.trim())return;setAiLoading(true);setAiA("");
          const ctx=`Portefeuille : ${companies.length} entreprises. ${companies.map(c=>`${c.name}(${c.sector},${c.stage},${c.status},score:${c.scores?.overall||"?"})`).join("; ")}.`;
          const ans=await callClaude(`Contexte portefeuille : ${ctx}\n\nQuestion : ${aiQ}`, "Tu es un associé VC senior. Donne des insights précis, spécifiques et actionnables.", {maxTokens:1200});
          setAiA(ans);setAiLoading(false);
        }} disabled={aiLoading}>{aiLoading?<><Spin/>Réflexion…</>:"✨ Interroger l'IA"}</Btn>
        {aiA&&<div style={{ marginTop:16, background:G.ink3, border:`1px solid ${G.ink4}`, borderRadius:10, padding:16, fontSize:13, lineHeight:1.8, color:G.fog, whiteSpace:"pre-wrap" }}>{aiA}</div>}
      </div>
    ), title:"Requête IA", sub:"Interrogez votre portefeuille" },
    email:        { comp:<EmailImportView key="email-import" onImport={importCompany} showToast={showToast}/>, title:"Import Email", sub:"Gmail · Roundcube · OVH · Coller" },
    add:          { comp:<AddView/>,       title:"Ajouter",             sub:"Saisie manuelle ou upload de fichiers" },
  };

  const current = views[view] || views.dashboard;

  return (
    <>
      <style>{`
        @keyframes spin  { to { transform:rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:.2} 50%{opacity:1} }
        * { box-sizing:border-box; margin:0; padding:0; -webkit-font-smoothing:antialiased; }
        html,body,#root { height:100%; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:${G.ink4}; border-radius:2px; }
        button { transition:filter .15s; }
        button:hover:not(:disabled) { filter:brightness(1.08); }
      `}</style>
      <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:G.ink, color:G.paper, fontFamily:"system-ui,-apple-system,sans-serif" }}>
        {/* SIDEBAR */}
        <nav style={{ width:218, minWidth:218, background:G.ink2, borderRight:`1px solid ${G.ink4}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"16px 12px 12px", borderBottom:`1px solid ${G.ink4}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:10 }}>
              <div style={{ width:30, height:30, background:G.lime, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>⬡</div>
              <div>
                <div style={{ fontSize:13, fontWeight:800, letterSpacing:"-.2px" }}>Dealflow OS</div>
                <div style={{ fontSize:9, color:G.mist, fontFamily:"monospace", letterSpacing:"1px" }}>VC · AI PLATFORM</div>
              </div>
            </div>
            <div style={{ background:G.ink3, border:`1px solid ${G.lime}33`, borderRadius:6, padding:"4px 8px", fontSize:9, color:G.lime, fontFamily:"monospace", display:"inline-block" }}>🔒 no-training</div>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"10px 8px" }}>
            {[
              ["Portfolio",""],
              ["dashboard","⬢","Dashboard",companies.length],
              ["pipeline","⬡","Pipeline",counts.dealflow],
              ["sectors","🥧","Secteurs",null],
              ["Intelligence",""],
              ["compare","⇄","Comparer",null],
              ["reports","📄","Rapports",companies.filter(c=>c.report).length],
              ["opportunities","💡","Opportunités",null],
              ["ai","✨","Requête IA",null],
              ["Données",""],
              ["email","📧","Import Email",null],
              ["add","✚","Ajouter",null],
            ].map((item,i)=>{
              if(typeof item[0] === "string" && item.length === 2 && item[1] === "") return <div key={i} style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"1.5px", color:G.mist, padding:"4px 10px 8px", marginTop:i>0?8:0 }}>{item[0]}</div>;
              const [id,icon,label,badge]=item;
              return <NavItem key={id} icon={icon} label={label} badge={badge} active={view===id} onClick={()=>setView(id)} />;
            })}
          </div>
          <div style={{ padding:"10px 8px", borderTop:`1px solid ${G.ink4}` }}>
            <NavItem icon="🗄" label="Démo" onClick={loadDemo} />
          </div>
        </nav>

        {/* MAIN */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ height:52, minHeight:52, background:G.ink2, borderBottom:`1px solid ${G.ink4}`, display:"flex", alignItems:"center", padding:"0 20px", gap:12 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>{current.title}</div>
              <div style={{ fontSize:10, color:G.mist, fontFamily:"monospace" }}>{current.sub}</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              <Btn ghost onClick={()=>setView("email")}>📧 Import email</Btn>
              <Btn onClick={()=>setView("add")}>✚ Ajouter</Btn>
              <Btn accent onClick={()=>setView("ai")}>✨ IA</Btn>
            </div>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:20 }}>{current.comp}</div>
        </div>

        {/* DETAIL PANEL */}
        {panel && (
          <>
            <div onClick={()=>setPanelId(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:190, backdropFilter:"blur(2px)" }} />
            <DetailPanel company={panel} onClose={()=>setPanelId(null)}
              onChange={patch=>mutate(panelId,patch)}
              onAction={handleAction} />
          </>
        )}

        <Toast msg={toast.msg} visible={toast.visible} />
      </div>
    </>
  );
}
