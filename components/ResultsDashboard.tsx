import React, { useState } from 'react';
import { AnalysisResult, Language, ChatMessage } from '../types';
import { askGeoExpert } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, LineChart, Line, ZAxis, Cell, ScatterChart, Scatter, Legend
} from 'recharts';

interface Props {
  results: AnalysisResult;
  lang: Language;
}

export const ResultsDashboard: React.FC<Props> = ({ results, lang }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'design' | 'fem' | 'solutions' | 'report' | 'ai'>('summary');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  if (!results || !results.settlement || !results.bearingCapacity) return null;

  const { settlement, bearingCapacity, femAnalysis, graphs, layers, doctorReport, recommendations, foundationDesign, slopeStability } = results;

  // Translations
  const t = {
    summary: lang === 'ar' ? 'نظرة عامة' : 'Overview',
    design: lang === 'ar' ? 'تصميم الأساس' : 'Struct. Design',
    fem: lang === 'ar' ? 'محاكاة' : 'Sim',
    solutions: lang === 'ar' ? 'التوصيات' : 'Solutions',
    report: lang === 'ar' ? 'التقرير' : 'Report',
    ai: lang === 'ar' ? 'الخبير' : 'AI Expert',
    chatPlaceholder: lang === 'ar' ? 'اطرح سؤالاً على الخبير الجيوتقني...' : 'Ask the Geotechnical Expert...',
  };

  // Export Functions
  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    setIsExportOpen(false);
    window.print();
  };

  const handleExportJSON = () => {
    downloadFile(JSON.stringify(results, null, 2), `SmartGeo_Analysis_${Date.now()}.json`, 'application/json');
    setIsExportOpen(false);
  };

  const handleExportCSV = () => {
    const headers = ['Section', 'Parameter', 'Value', 'Unit'];
    const rows = [];
    
    // Summary Results
    rows.push(['Results', 'Total Settlement', settlement.total.toFixed(2), 'mm']);
    rows.push(['Results', 'Bearing Capacity (Qall)', bearingCapacity.q_allow.toFixed(2), 'kPa']);
    rows.push(['Results', 'Bearing Capacity (Qult)', bearingCapacity.q_ult.toFixed(2), 'kPa']);
    rows.push(['Results', 'Factor of Safety', bearingCapacity.factorOfSafety.toFixed(2), '-']);
    rows.push(['Results', 'Time to Max Settlement', settlement.timeToMaxSettlement, '-']);
    
    if (slopeStability) {
        rows.push(['Slope Stability', 'Factor of Safety', slopeStability.factorOfSafety.toFixed(2), '-']);
        rows.push(['Slope Stability', 'Status', slopeStability.status, '-']);
    }

    rows.push(['Design', 'Reinforcement', foundationDesign.barSuggestion.replace(/,/g, ' '), '-']);

    // Layers
    results.layers.forEach((l, i) => {
        const p = l.params;
        rows.push([`Layer ${i+1}`, 'Depth', `"${l.depth}"`, 'm']);
        rows.push([`Layer ${i+1}`, 'Description', `"${l.description}"`, '-']);
        rows.push([`Layer ${i+1}`, 'Unit Weight', p.gamma, 'kN/m3']);
        rows.push([`Layer ${i+1}`, 'Friction Angle', p.phi, 'deg']);
        rows.push([`Layer ${i+1}`, 'Cohesion', p.c, 'kPa']);
        rows.push([`Layer ${i+1}`, 'Modulus (E)', p.E, 'MPa']);
        if (p.consolidation) {
             rows.push([`Layer ${i+1}`, 'Cc', p.consolidation.cc, '-']);
             rows.push([`Layer ${i+1}`, 'Cv', p.consolidation.cv, 'm2/yr']);
        }
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csvContent, `SmartGeo_Report_${Date.now()}.csv`, 'text/csv');
    setIsExportOpen(false);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', text: chatInput };
    setChatHistory([...chatHistory, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const answer = await askGeoExpert([...chatHistory, userMsg], results, lang);
      setChatHistory(prev => [...prev, { role: 'model', text: answer }]);
    } catch (e) { console.error(e); } 
    finally { setChatLoading(false); }
  };

  // Helper for FEM Colors (Blue -> Cyan -> Yellow -> Red)
  const getStressColor = (value: number, min: number, max: number) => {
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    // Simple heatmap interpolation
    const r = Math.round(Math.max(0, 255 * (2 * ratio - 1)));
    const b = Math.round(Math.max(0, 255 * (1 - 2 * ratio)));
    const g = Math.round(255 - Math.abs(255 * (2 * ratio - 1)));
    return `rgb(${r}, ${g}, ${b})`;
  };

  const femMinStress = Math.min(...femAnalysis.stressMesh.map(p => p.stress));
  const femMaxStress = Math.max(...femAnalysis.stressMesh.map(p => p.stress));

  return (
    <div className="space-y-6 printable-content">
      
      {/* Navigation Bar */}
      <div className="glass-panel p-2 rounded-2xl flex flex-wrap justify-between items-center shadow-lg shadow-slate-200/50 no-print sticky top-24 z-30">
        <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          {[
            { id: 'summary', icon: '📊', label: t.summary },
            { id: 'design', icon: '🏗️', label: t.design },
            { id: 'fem', icon: '🕸️', label: t.fem },
            { id: 'solutions', icon: '💡', label: t.solutions },
            { id: 'report', icon: '📑', label: t.report },
            { id: 'ai', icon: '🤖', label: t.ai },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                activeTab === tab.id 
                ? 'bg-slate-900 text-white shadow-md transform scale-105' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="opacity-80">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Export Dropdown */}
        <div className="relative">
            <button 
                onClick={() => setIsExportOpen(!isExportOpen)}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-200"
            >
                <span>📤</span>
                <span>{lang === 'ar' ? 'تصدير' : 'Export'}</span>
            </button>

            {isExportOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsExportOpen(false)}></div>
                    <div className={`absolute top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-fade-in ${lang === 'ar' ? 'left-0' : 'right-0'}`}>
                        <button onClick={handlePrint} className="w-full text-start px-4 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 flex items-center gap-3 border-b border-slate-50 transition-colors">
                            <span className="text-lg">🖨️</span> 
                            <div className="flex flex-col">
                                <span>{lang === 'ar' ? 'طباعة / PDF' : 'Print / PDF'}</span>
                                <span className="text-[9px] text-slate-400 font-normal">Save report as PDF document</span>
                            </div>
                        </button>
                        <button onClick={handleExportCSV} className="w-full text-start px-4 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 flex items-center gap-3 border-b border-slate-50 transition-colors">
                            <span className="text-lg">📊</span> 
                            <div className="flex flex-col">
                                <span>{lang === 'ar' ? 'ملف Excel CSV' : 'CSV Spreadsheet'}</span>
                                <span className="text-[9px] text-slate-400 font-normal">Table data for Excel</span>
                            </div>
                        </button>
                        <button onClick={handleExportJSON} className="w-full text-start px-4 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 flex items-center gap-3 transition-colors">
                            <span className="text-lg">💻</span> 
                            <div className="flex flex-col">
                                <span>{lang === 'ar' ? 'بيانات JSON' : 'JSON Data'}</span>
                                <span className="text-[9px] text-slate-400 font-normal">Raw analysis data</span>
                            </div>
                        </button>
                    </div>
                </>
            )}
        </div>
      </div>

      <div className="min-h-[600px]">
        
        {/* SUMMARY TAB */}
        {activeTab === 'summary' && (
          <div className="space-y-6 animate-fade-in">
            {/* KPI WIDGETS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              {/* Settlement Card */}
              <div className="glass-panel p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-white relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-full h-1 ${settlement.status === 'Safe' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{lang === 'ar' ? 'الهبوط الكلي' : 'TOTAL SETTLEMENT'}</h3>
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-black text-slate-800 tracking-tight">{settlement.total.toFixed(1)}</span>
                            <span className="text-xs font-medium text-slate-400">mm</span>
                        </div>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 text-[9px] text-center grid grid-cols-2 gap-1">
                    <span className="text-slate-400">Elastic: <b>{settlement.elastic.toFixed(1)}</b></span>
                    <span className="text-blue-500">Consol: <b>{(settlement.primary + settlement.secondary).toFixed(1)}</b></span>
                </div>
              </div>

              {/* Bearing Capacity Card */}
              <div className="glass-panel p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-white relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                <div>
                    <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{lang === 'ar' ? 'قدرة التحمل' : 'BEARING CAPACITY'}</h3>
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-slate-800 tracking-tight">{bearingCapacity.q_allow.toFixed(0)}</span>
                        <span className="text-xs font-medium text-slate-400">kPa</span>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 text-xs flex justify-between">
                    <span className="text-slate-400">Actual FS: <b>{bearingCapacity.factorOfSafety.toFixed(2)}</b></span>
                    <span className="text-slate-400">Qult: {bearingCapacity.q_ult.toFixed(0)}</span>
                </div>
              </div>

              {/* Time Card */}
              <div className="glass-panel p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-white relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
                <div>
                    <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{lang === 'ar' ? 'زمن الهبوط' : 'TIME TO MAX SET'}</h3>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-slate-800 tracking-tight">{settlement.timeToMaxSettlement}</span>
                    </div>
                </div>
              </div>

               {/* SLOPE STABILITY CARD (New) */}
               {slopeStability && (
                <div className="glass-panel p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-white relative overflow-hidden group">
                   <div className={`absolute top-0 left-0 w-full h-1 ${slopeStability.status === 'Stable' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                   <div>
                       <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{lang === 'ar' ? 'استقرار المنحدر' : 'SLOPE STABILITY'}</h3>
                       <div className="flex items-baseline gap-1">
                           <span className={`text-4xl font-black tracking-tight ${slopeStability.status === 'Stable' ? 'text-emerald-600' : 'text-red-600'}`}>{slopeStability.factorOfSafety.toFixed(2)}</span>
                           <span className="text-xs font-medium text-slate-400">FOS</span>
                       </div>
                       <p className="text-[10px] text-slate-400 mt-1">{slopeStability.method}</p>
                   </div>
                </div>
               )}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">
                <div className="glass-panel p-6 rounded-3xl border border-white shadow-sm">
                    <h4 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-2">
                        <span className="w-2 h-6 bg-purple-500 rounded-full"></span>
                        Time-Settlement Curve
                    </h4>
                    <div className="h-[300px] w-full" dir="ltr">
                        <ResponsiveContainer>
                            <AreaChart data={graphs.timeSettlement}>
                                <defs>
                                    <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5}/>
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                <XAxis dataKey="x" type="number" fontSize={10} axisLine={false} tickLine={false} label={{value: 'Time (Years)', position: 'insideBottom', offset: -5, fontSize: 10}} dy={10} />
                                <YAxis fontSize={10} axisLine={false} tickLine={false} dx={-10} label={{value: 'Settlement (mm)', angle: -90, position: 'insideLeft', fontSize: 10}} />
                                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'}} />
                                <Area type="monotone" dataKey="y" stroke="#8b5cf6" strokeWidth={4} fill="url(#colorTime)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl border border-white shadow-sm">
                    <h4 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-2">
                        <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                        Load-Settlement Curve
                    </h4>
                    <div className="h-[300px] w-full" dir="ltr">
                        <ResponsiveContainer>
                            <AreaChart data={graphs.loadSettlement}>
                                <defs>
                                    <linearGradient id="colorSettlement" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                                <XAxis dataKey="y" type="number" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}mm`} dy={10} />
                                <YAxis fontSize={10} axisLine={false} tickLine={false} dx={-10} />
                                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'}} />
                                <Area type="monotone" dataKey="x" stroke="#3b82f6" strokeWidth={4} fill="url(#colorSettlement)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* DESIGN TAB */}
        {activeTab === 'design' && (
           <div className="animate-fade-in glass-panel rounded-3xl border border-white overflow-hidden shadow-sm p-8">
               <div className="flex items-center gap-4 mb-8 border-b border-slate-100 pb-4">
                  <div className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center text-2xl">🏗️</div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">{lang === 'ar' ? 'التصميم الإنشائي للأساس' : 'Structural Foundation Design'}</h2>
                    <p className="text-slate-500 text-sm">Design compliant with ACI-318 Code</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Blueprint Card */}
                  <div className="bg-blue-600 text-white p-6 rounded-3xl relative overflow-hidden shadow-lg shadow-blue-200">
                     <div className="absolute top-0 right-0 p-20 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                     <h3 className="font-bold opacity-80 uppercase tracking-widest text-xs mb-4">Reinforcement Details</h3>
                     
                     <div className="mb-6">
                        <div className="text-xs opacity-70 mb-1">Provided Reinforcement (As)</div>
                        <div className="text-4xl font-mono font-bold tracking-tight">{foundationDesign.barSuggestion}</div>
                        <div className="text-sm opacity-60 mt-1">Bottom Mesh (Both ways)</div>
                     </div>

                     <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                        <div>
                          <div className="text-xs opacity-70">Area Required</div>
                          <div className="font-mono font-bold">{foundationDesign.reinforcementArea.toFixed(0)} mm²/m</div>
                        </div>
                        <div>
                          <div className="text-xs opacity-70">Min. Thickness</div>
                          <div className="font-mono font-bold">{foundationDesign.minThickness} m</div>
                        </div>
                     </div>
                  </div>

                  {/* Checks Card */}
                  <div className="space-y-4">
                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                        <div>
                           <div className="text-xs font-bold text-slate-400 uppercase">Punching Shear</div>
                           <div className="font-bold text-slate-700">Check Status</div>
                        </div>
                        <span className={`px-3 py-1 rounded-lg font-bold text-sm ${foundationDesign.punchingShearCheck === 'Safe' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                           {foundationDesign.punchingShearCheck}
                        </span>
                     </div>
                     
                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-2">Design Notes</div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                           {foundationDesign.notes}
                        </p>
                     </div>
                  </div>
               </div>
           </div>
        )}

        {/* FEM TAB - UPDATED VISUALIZATION */}
        {activeTab === 'fem' && (
            <div className="animate-fade-in bg-[#0f172a] text-white p-8 rounded-3xl shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">Pressure Bulb (Stress Heatmap)</h2>
                        <p className="text-slate-500 text-sm mt-1">2D FEM Analysis • {femMinStress.toFixed(0)} kPa to {femMaxStress.toFixed(0)} kPa</p>
                    </div>
                    
                    {/* Color Legend */}
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span>Low</span>
                        <div className="w-24 h-2 rounded bg-gradient-to-r from-blue-600 via-green-500 to-red-500"></div>
                        <span>High</span>
                    </div>
                </div>
                
                <div className="h-[500px] w-full bg-[#1e293b] rounded-2xl relative overflow-hidden border border-slate-700 shadow-inner" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                            <XAxis type="number" dataKey="x" name="Offset" unit="m" stroke="#94a3b8" tick={{fill: '#94a3b8', fontSize: 10}} allowDataOverflow={false} />
                            <YAxis type="number" dataKey="z" name="Depth" unit="m" reversed stroke="#94a3b8" tick={{fill: '#94a3b8', fontSize: 10}} allowDataOverflow={false} />
                            <Tooltip 
                              cursor={{ strokeDasharray: '3 3' }} 
                              contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff'}} 
                              formatter={(value: any, name: any) => [parseFloat(value).toFixed(2), name === 'stress' ? 'Stress (kPa)' : name]}
                            />
                            <Scatter name="Stress Nodes" data={femAnalysis.stressMesh}>
                                {femAnalysis.stressMesh.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={getStressColor(entry.stress, femMinStress, femMaxStress)} 
                                      strokeWidth={0}
                                    />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
                
                <div className="mt-6 grid grid-cols-2 gap-4">
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                         <span className="text-slate-400 text-xs font-bold uppercase">Max Displacement (Uy)</span>
                         <div className="text-3xl font-mono text-emerald-400 mt-1">{femAnalysis.maxDisplacement} mm</div>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                         <span className="text-slate-400 text-xs font-bold uppercase">Plastic Points</span>
                         <div className="text-sm text-slate-300 mt-2">{femAnalysis.plasticPoints}</div>
                    </div>
                </div>
            </div>
        )}

        {/* SOLUTIONS TAB */}
        {activeTab === 'solutions' && (
            <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className={`p-8 rounded-3xl bg-gradient-to-br ${recommendations.riskLevel === 'High' ? 'from-rose-500 to-red-600 text-white shadow-rose-200' : recommendations.riskLevel === 'Medium' ? 'from-amber-400 to-orange-500 text-white' : 'from-emerald-400 to-green-600 text-white'} shadow-xl`}>
                    <h3 className="text-sm font-bold opacity-80 uppercase tracking-widest mb-2">Overall Risk Level</h3>
                    <div className="text-5xl font-black tracking-tighter">{recommendations.riskLevel}</div>
                    <p className="mt-4 opacity-90 text-sm leading-relaxed">
                        Based on the computed bearing capacity factors and settlement analysis, this classification suggests the immediate attention required.
                    </p>
                </div>
                
                <div className="glass-panel p-8 rounded-3xl shadow-sm border border-white md:col-span-2">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-3 text-xl">
                        <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">💡</span> 
                        {lang === 'ar' ? 'الحلول الهندسية المقترحة' : 'Engineered Solutions'}
                    </h3>
                    <div className="grid gap-4">
                        {recommendations.solutions.map((sol, i) => (
                            <div key={i} className="flex gap-4 p-4 bg-white rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group">
                                <span className="text-3xl opacity-20 font-black text-slate-300 group-hover:text-indigo-200 transition-colors">0{i+1}</span>
                                <span className="text-slate-700 font-medium self-center">{sol}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* REPORT TAB - DOCUMENT STYLE */}
        {activeTab === 'report' && (
             <div className="bg-white p-12 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 animate-fade-in max-w-4xl mx-auto">
                 <div className="flex justify-between items-end border-b-2 border-slate-900 pb-6 mb-8">
                     <div>
                         <h1 className="text-3xl font-black text-slate-900 tracking-tight">Geotechnical Report</h1>
                         <p className="text-slate-500 mt-2">Generated by SmartGeo AI Engine</p>
                     </div>
                     <div className="text-right">
                         <div className="text-sm font-bold text-slate-900">{new Date().toLocaleDateString()}</div>
                         <div className="text-xs text-slate-400 uppercase tracking-widest">Confidential</div>
                     </div>
                 </div>
                 <div className="prose prose-slate prose-lg max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-600 prose-p:leading-loose prose-li:text-slate-600 prose-strong:text-indigo-700">
                     <ReactMarkdown>{doctorReport}</ReactMarkdown>
                 </div>
                 <div className="mt-12 pt-8 border-t border-slate-100 text-center">
                     <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">End of Document • SmartGeo Pro</p>
                 </div>
             </div>
        )}

        {/* AI CHAT TAB */}
        {activeTab === 'ai' && (
            <div className="glass-panel rounded-3xl shadow-2xl border border-white flex flex-col h-[650px] animate-fade-in no-print overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-indigo-50/50 to-white/50 pointer-events-none"></div>
                
                {/* Chat Header */}
                <div className="p-6 bg-white/80 backdrop-blur-md border-b border-slate-100 z-10 flex items-center gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-indigo-200">🤖</div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-lg">Dr. Geo AI</h3>
                        <p className="text-xs text-slate-500 font-medium">Online • Gemini 2.5 Flash Engine</p>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-grow p-6 overflow-y-auto space-y-6 z-10 scroll-smooth">
                    {chatHistory.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-4xl mb-4">💬</div>
                            <p className="text-slate-500 font-medium">{t.chatPlaceholder}</p>
                        </div>
                    )}
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[85%] p-5 rounded-3xl shadow-sm leading-relaxed ${
                                msg.role === 'user' 
                                ? 'bg-white text-slate-700 border border-slate-100 rounded-tl-none' 
                                : 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-200'
                            }`}>
                                <div className="prose prose-sm prose-invert max-w-none">
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}
                    {chatLoading && (
                        <div className="flex justify-end">
                            <div className="bg-indigo-600 text-white px-5 py-3 rounded-3xl rounded-tr-none flex gap-2 items-center">
                                <span className="w-2 h-2 bg-white rounded-full animate-bounce"></span>
                                <span className="w-2 h-2 bg-white rounded-full animate-bounce delay-100"></span>
                                <span className="w-2 h-2 bg-white rounded-full animate-bounce delay-200"></span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-slate-100 z-10">
                    <div className="flex gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:ring-2 ring-indigo-100 transition-all">
                        <input 
                            type="text" 
                            className="flex-grow p-3 bg-transparent outline-none text-slate-700 placeholder-slate-400 font-medium"
                            placeholder={t.chatPlaceholder}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={chatLoading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-indigo-200 hover:shadow-indigo-300"
                        >
                            ➤
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};