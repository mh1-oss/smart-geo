import React, { useState, useEffect } from 'react';
import { SoilLayer, SoilType, FoundationData, AnalysisResult, CalibrationRecord, ManualLabData, Language, AnalysisHistoryItem } from './types';
import { analyzeSoilProfile } from './services/analysisService';
import { SoilVisualizer } from './components/SoilVisualizer';
import { ResultsDashboard } from './components/ResultsDashboard';

// Default Data
const defaultFoundation: FoundationData = {
  width: 10,
  length: 10,
  depth: 2.0,
  load: 16000,
  moment: 4000,
  type: 'raft',
  shapeFactor: 1.3,
  groundwaterDepth: 2.0,
  concreteGrade: 28, // MPa
  steelGrade: 420, // MPa
  slopeAngle: 0, // degrees
  targetFos: 3.0 // Default target factor of safety
};

const defaultLabData: ManualLabData = {
  useManual: false,
  unitWeight: 19,
  cohesion: 0,
  frictionAngle: 30,
  elasticModulus: 50,
  poissonsRatio: 0.35,
  cAlpha: 0.005 // Default secondary comp
};

function App() {
  const [lang, setLang] = useState<Language>('ar');
  const [activeInputTab, setActiveInputTab] = useState<'foundation' | 'layers'>('foundation');

  const [layers, setLayers] = useState<SoilLayer[]>([
    { id: '1', depthFrom: 0, depthTo: 15, type: SoilType.Sand, sptN: 20, labData: { ...defaultLabData, useManual: true, unitWeight: 19, frictionAngle: 30, cohesion: 0, elasticModulus: 50, poissonsRatio: 0.35 } },
    { id: '2', depthFrom: 15, depthTo: 22, type: SoilType.Clay, sptN: 8, labData: { ...defaultLabData, useManual: true, unitWeight: 18, frictionAngle: 0, cohesion: 90, elasticModulus: 20, poissonsRatio: 0.3, cc: 0.18, cv: 0.4, cAlpha: 0.015 } }
  ]);
  const [foundation, setFoundation] = useState<FoundationData>(defaultFoundation);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [calibrationData, setCalibrationData] = useState<CalibrationRecord[]>([]);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [newCalibration, setNewCalibration] = useState<Partial<CalibrationRecord>>({ soilType: SoilType.Sand, sptN: 10 });

  // History State
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.className = `lang-${lang} antialiased selection:bg-indigo-100 selection:text-indigo-700`;
  }, [lang]);

  const addLayer = () => {
    const lastLayer = layers[layers.length - 1];
    const newFrom = lastLayer ? lastLayer.depthTo : 0;
    const newTo = newFrom + 2;
    setLayers([...layers, {
      id: Math.random().toString(36).substr(2, 9),
      depthFrom: newFrom,
      depthTo: newTo,
      type: SoilType.Silt,
      sptN: 10,
      labData: { ...defaultLabData, useManual: true }
    }]);
  };

  const removeLayer = (id: string) => setLayers(layers.filter(l => l.id !== id));
  const updateLayer = (id: string, field: keyof SoilLayer, value: any) => setLayers(layers.map(l => l.id === id ? { ...l, [field]: value } : l));
  const updateLayerLabData = (id: string, field: keyof ManualLabData, value: any) => setLayers(layers.map(l => l.id === id ? { ...l, labData: { ...l.labData, [field]: value } } : l));

  const handleAddCalibration = () => {
    if (newCalibration.sptN) {
      setCalibrationData([...calibrationData, {
        id: Math.random().toString(),
        soilType: newCalibration.soilType || SoilType.Sand,
        sptN: newCalibration.sptN,
        actualPhi: newCalibration.actualPhi,
        actualC: newCalibration.actualC,
        actualE: newCalibration.actualE,
        description: "Calibration Point"
      } as CalibrationRecord]);
    }
  };

  const handleAnalysis = async () => {
    setLoading(true);
    try {
      // 100% Deterministic & Instant
      const data = analyzeSoilProfile(layers, foundation, calibrationData, lang);
      setResult(data);
      setShowResults(true);

      // Save to history
      const historyItem: AnalysisHistoryItem = {
        id: Date.now().toString(),
        date: new Date().toLocaleString(),
        foundationType: foundation.type,
        load: foundation.load,
        result: data
      };
      setHistory([historyItem, ...history]);

    } catch (error) {
      console.error(error);
      alert('Analysis Error');
    } finally {
      setLoading(false);
    }
  };

  const handleEnhanceReport = async () => {
    if (!result) return;

    // Set loading flag for UI
    setResult(prev => prev ? ({ ...prev, isAiGenerating: true }) : null);

    try {
      const { enhanceReportWithAI } = await import('./services/geminiService');
      const aiData = await enhanceReportWithAI(result, layers, foundation, lang);

      setResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          doctorReport: aiData.doctorReport,
          recommendations: { ...prev.recommendations, ...aiData.recommendations },
          foundationDesign: { ...prev.foundationDesign, notes: aiData.designNotes },
          isAiGenerating: false
        };
      });
    } catch (error) {
      console.error(error);
      alert(lang === 'ar' ? 'فشل الاتصال بالذكاء الاصطناعي' : 'AI Connection Failed');
      setResult(prev => prev ? ({ ...prev, isAiGenerating: false }) : null);
    }
  };

  const loadFromHistory = (item: AnalysisHistoryItem) => {
    setResult(item.result);
    setShowResults(true);
    setShowHistory(false);
  };

  // Modern Input Component with Tooltip
  const LabelWithTooltip = ({ label, tooltip }: { label: string, tooltip: string }) => (
    <div className="flex items-center gap-1 absolute -top-2 right-3 px-1 bg-white">
      <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest transition-colors">{label}</span>
      <div className="group relative cursor-help">
        <span className="text-[10px] text-slate-400 border border-slate-300 rounded-full w-3 h-3 flex items-center justify-center">?</span>
        <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-800 text-white text-xs p-2 rounded shadow-lg hidden group-hover:block z-50">
          {tooltip}
        </div>
      </div>
    </div>
  );

  const InputGroup = ({ label, tooltip, value, onChange, type = "number", placeholder = "" }: any) => (
    <div className="relative group">
      <LabelWithTooltip label={label} tooltip={tooltip} />
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm group-hover:border-indigo-200"
      />
    </div>
  );

  return (
    <div className="min-h-screen pb-20 font-sans text-slate-800">

      {/* HISTORY SIDEBAR */}
      {showHistory && (
        <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <div className="absolute left-0 top-0 h-full w-80 bg-white shadow-2xl p-6 overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-bold text-xl text-slate-800">📜 Analysis History</h2>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-red-500">✕</button>
            </div>
            <div className="space-y-3">
              {history.length === 0 && <p className="text-slate-400 text-sm text-center italic">No history yet.</p>}
              {history.map(item => (
                <div key={item.id} onClick={() => loadFromHistory(item)} className="p-4 bg-slate-50 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 border border-transparent cursor-pointer transition-all group">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold uppercase bg-white px-2 py-0.5 rounded text-indigo-600 shadow-sm">{item.foundationType}</span>
                    <span className="text-[10px] text-slate-400">{item.date}</span>
                  </div>
                  <div className="font-bold text-slate-700">Load: {item.load} kN</div>
                  <div className="text-xs text-slate-500 mt-1 truncate">
                    Set: {item.result.settlement.total.toFixed(1)}mm • SF: {item.result.bearingCapacity.factorOfSafety}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* RESULTS SEPARATE WINDOW (MODAL) */}
      {showResults && result && (
        <div className="fixed inset-0 z-[100] bg-slate-50 overflow-auto animate-fade-in printable-content">
          {/* Modal Header */}
          <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-slate-200 p-4 flex justify-between items-center shadow-sm z-50 no-print">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-xl">📊</div>
              <div>
                <h2 className="font-black text-lg text-slate-900">{lang === 'ar' ? 'تقرير التحليل النهائي' : 'Final Analysis Report'}</h2>
                <p className="text-xs text-slate-500">Based on provided Image Data & Manual Inputs</p>
              </div>
            </div>
            <button
              onClick={() => setShowResults(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-2 rounded-xl font-bold transition-all"
            >
              {lang === 'ar' ? 'إغلاق ✕' : 'Close ✕'}
            </button>
          </div>

          <div className="max-w-7xl mx-auto p-6">
            <ResultsDashboard results={result} lang={lang} onEnhance={handleEnhanceReport} />
          </div>
        </div>
      )}

      {/* Calibration Modal */}
      {isCalibrating && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden transform transition-all scale-100">
            <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">🧠 AI Model Calibration</h3>
              <button onClick={() => setIsCalibrating(false)} className="bg-white/10 hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center transition">✕</button>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-4 gap-3 mb-6">
                <select className="col-span-1 p-3 bg-slate-50 rounded-xl border-none font-bold text-sm" value={newCalibration.soilType} onChange={(e) => setNewCalibration({ ...newCalibration, soilType: e.target.value as any })}>
                  {Object.values(SoilType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="SPT N" type="number" className="p-3 bg-slate-50 rounded-xl font-bold text-center" onChange={e => setNewCalibration({ ...newCalibration, sptN: Number(e.target.value) })} />
                <input placeholder="Φ" type="number" className="p-3 bg-slate-50 rounded-xl font-bold text-center" onChange={e => setNewCalibration({ ...newCalibration, actualPhi: Number(e.target.value) })} />
                <button onClick={handleAddCalibration} className="bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200">+</button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {calibrationData.map((c, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                    <span className="font-bold text-slate-700">{c.soilType} <span className="text-slate-400 font-normal ml-1">N={c.sptN}</span></span>
                    <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs">{c.actualPhi ? `Φ=${c.actualPhi}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Floating Header */}
      <header className="fixed top-0 w-full z-50 px-4 py-4 no-print pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-center pointer-events-auto">
          {/* Logo Pill */}
          <div className="bg-white/80 backdrop-blur-md border border-white/50 shadow-lg shadow-slate-200/50 px-4 py-2 rounded-full flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-full flex items-center justify-center text-white text-sm shadow-md">⚡</div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-800">SmartGeo<span className="text-indigo-600">Pro</span></h1>
            </div>
          </div>

          {/* Actions Pill */}
          <div className="flex gap-2 bg-white/80 backdrop-blur-md border border-white/50 shadow-lg shadow-slate-200/50 p-1.5 rounded-full">
            <button onClick={() => setShowHistory(true)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 text-xs font-bold transition flex items-center gap-1">
              <span>📜</span> History
            </button>
            <div className="flex bg-slate-100 rounded-full p-1">
              <button onClick={() => setLang('ar')} className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${lang === 'ar' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>AR</button>
              <button onClick={() => setLang('en')} className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${lang === 'en' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>EN</button>
            </div>
            <button onClick={() => setIsCalibrating(true)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-900 text-white hover:bg-indigo-600 transition-colors shadow-md">
              🧠
            </button>
          </div>
        </div>
      </header>

      <main id="main-app-content" className="max-w-7xl mx-auto px-4 pt-24">

        {/* HERO SECTION */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

          {/* LEFT: INPUTS (Floating Card) */}
          <div className="xl:col-span-4 space-y-6 no-print">

            <div className="glass-panel rounded-3xl p-1 shadow-xl shadow-slate-200/50 border border-white">
              {/* Toggle Input Tabs */}
              <div className="flex p-1 bg-slate-100/50 rounded-2xl mb-4">
                <button onClick={() => setActiveInputTab('foundation')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${activeInputTab === 'foundation' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>
                  Foundation
                </button>
                <button onClick={() => setActiveInputTab('layers')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${activeInputTab === 'layers' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>
                  Soil Layers
                </button>
              </div>

              <div className="px-5 pb-6">
                {/* FOUNDATION FORM */}
                {activeInputTab === 'foundation' && (
                  <div className="space-y-5 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Foundation Type</label>
                        <div className="grid grid-cols-4 gap-2">
                          {['isolated', 'raft', 'strip', 'circular'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setFoundation({ ...foundation, type: t as any })}
                              className={`py-3 rounded-xl text-[10px] font-bold border-2 transition-all ${foundation.type === t ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      <InputGroup label="Load (kN)" tooltip="Total applied vertical load including structure weight" value={foundation.load} onChange={(e: any) => setFoundation({ ...foundation, load: Number(e.target.value) })} />
                      <InputGroup label="Moment (kN.m)" tooltip="Applied overturning moment at foundation level" value={foundation.moment || 0} onChange={(e: any) => setFoundation({ ...foundation, moment: Number(e.target.value) })} />
                      <InputGroup label="Depth Df (m)" tooltip="Depth of embedment from ground surface" value={foundation.depth} onChange={(e: any) => setFoundation({ ...foundation, depth: Number(e.target.value) })} />

                      {foundation.type === 'circular' ? (
                        <div className="col-span-1">
                          <InputGroup label="Diameter (m)" tooltip="Diameter of the circular footing" value={foundation.diameter || 2} onChange={(e: any) => setFoundation({ ...foundation, diameter: Number(e.target.value) })} />
                        </div>
                      ) : (
                        <>
                          <InputGroup label="Width B (m)" tooltip="Short dimension of the foundation" value={foundation.width} onChange={(e: any) => setFoundation({ ...foundation, width: Number(e.target.value) })} />
                          <InputGroup label="Length L (m)" tooltip="Long dimension of the foundation" value={foundation.length} onChange={(e: any) => setFoundation({ ...foundation, length: Number(e.target.value) })} />
                        </>
                      )}

                      <div className="col-span-2 mt-2 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                        <InputGroup label="Concrete (MPa)" tooltip="Concrete Compressive Strength (fc')" value={foundation.concreteGrade} onChange={(e: any) => setFoundation({ ...foundation, concreteGrade: Number(e.target.value) })} />
                        <InputGroup label="Steel (MPa)" tooltip="Steel Yield Strength (fy)" value={foundation.steelGrade} onChange={(e: any) => setFoundation({ ...foundation, steelGrade: Number(e.target.value) })} />
                      </div>

                      <div className="col-span-2 mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-4">
                        <InputGroup label="Groundwater (m)" tooltip="Depth of GWT from surface" value={foundation.groundwaterDepth} onChange={(e: any) => setFoundation({ ...foundation, groundwaterDepth: Number(e.target.value) })} />
                        <InputGroup label="Slope Angle (°)" tooltip="Inclination of ground surface (0 for flat)" value={foundation.slopeAngle} onChange={(e: any) => setFoundation({ ...foundation, slopeAngle: Number(e.target.value) })} />
                      </div>

                      <div className="col-span-2 mt-2 pt-2 border-t border-slate-100">
                        <InputGroup label="Target FOS" tooltip="Target Factor of Safety for Allowable Capacity" value={foundation.targetFos || 3.0} onChange={(e: any) => setFoundation({ ...foundation, targetFos: Number(e.target.value) })} />
                      </div>
                    </div>
                  </div>
                )}

                {/* LAYERS FORM */}
                {activeInputTab === 'layers' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
                      {layers.map((layer, index) => (
                        <div key={layer.id} className="group relative bg-slate-50 hover:bg-white border border-transparent hover:border-indigo-100 rounded-2xl p-4 transition-all hover:shadow-lg">
                          <div className="absolute top-2 left-2 text-[10px] font-bold text-slate-300 group-hover:text-indigo-300">#{index + 1}</div>
                          <button onClick={() => removeLayer(layer.id)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition-colors text-xs font-bold px-2">✕</button>

                          <div className="mt-2 flex items-center gap-3">
                            <select value={layer.type} onChange={(e) => updateLayer(layer.id, 'type', e.target.value)} className="bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-indigo-500 w-1/3">
                              {Object.values(SoilType).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <div className="flex-1 flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-1">
                              <input className="w-full p-1 text-center font-bold text-sm outline-none" value={layer.depthFrom} onChange={(e) => updateLayer(layer.id, 'depthFrom', Number(e.target.value))} />
                              <span className="text-slate-300">➜</span>
                              <input className="w-full p-1 text-center font-bold text-sm outline-none" value={layer.depthTo} onChange={(e) => updateLayer(layer.id, 'depthTo', Number(e.target.value))} />
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600">SPT</div>
                              <input type="number" className="w-16 p-2 bg-white border border-slate-200 rounded-lg text-center font-bold text-indigo-600 focus:ring-2 ring-indigo-500 outline-none" value={layer.sptN} onChange={(e) => updateLayer(layer.id, 'sptN', Number(e.target.value))} />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Manual Data</span>
                              <input type="checkbox" checked={layer.labData.useManual} onChange={(e) => updateLayerLabData(layer.id, 'useManual', e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                            </label>
                          </div>

                          {layer.labData.useManual && (
                            <div className="mt-3 grid grid-cols-4 gap-2 animate-fade-in bg-white p-2 rounded-xl border border-indigo-50 shadow-inner">
                              {/* Standard Params with Tooltips via Placeholder or separate labels if space permits */}
                              <div className="col-span-4 grid grid-cols-4 gap-2">
                                <input
                                  type="number" placeholder="γ (kN/m3)" title="Unit Weight"
                                  className="w-full bg-slate-50 border-none rounded text-xs text-center p-1.5 focus:ring-1 ring-indigo-200"
                                  value={layer.labData.unitWeight} onChange={(e) => updateLayerLabData(layer.id, 'unitWeight', Number(e.target.value))}
                                />
                                <input
                                  type="number" placeholder="c (kPa)" title="Cohesion"
                                  className="w-full bg-slate-50 border-none rounded text-xs text-center p-1.5 focus:ring-1 ring-indigo-200"
                                  value={layer.labData.cohesion} onChange={(e) => updateLayerLabData(layer.id, 'cohesion', Number(e.target.value))}
                                />
                                <input
                                  type="number" placeholder="φ (deg)" title="Friction Angle"
                                  className="w-full bg-slate-50 border-none rounded text-xs text-center p-1.5 focus:ring-1 ring-indigo-200"
                                  value={layer.labData.frictionAngle} onChange={(e) => updateLayerLabData(layer.id, 'frictionAngle', Number(e.target.value))}
                                />
                                <input
                                  type="number" placeholder="E (MPa)" title="Elastic Modulus"
                                  className="w-full bg-slate-50 border-none rounded text-xs text-center p-1.5 focus:ring-1 ring-indigo-200"
                                  value={layer.labData.elasticModulus} onChange={(e) => updateLayerLabData(layer.id, 'elasticModulus', Number(e.target.value))}
                                />
                                <input
                                  type="number" placeholder="ν (Nu)" title="Poisson's Ratio"
                                  className="w-full bg-slate-50 border-none rounded text-xs text-center p-1.5 focus:ring-1 ring-indigo-200"
                                  value={layer.labData.poissonsRatio} onChange={(e) => updateLayerLabData(layer.id, 'poissonsRatio', Number(e.target.value))}
                                />
                              </div>

                              {/* Consolidation Params */}
                              {(layer.type === SoilType.Clay || layer.type === SoilType.Silt) && (
                                <div className="col-span-4 grid grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                                  <input type="number" placeholder="Cc" title="Compression Index" className="bg-yellow-50 text-yellow-800 rounded p-1 text-xs text-center" value={layer.labData.cc} onChange={(e) => updateLayerLabData(layer.id, 'cc', Number(e.target.value))} />
                                  <input type="number" placeholder="Cr" title="Recompression Index" className="bg-yellow-50 text-yellow-800 rounded p-1 text-xs text-center" value={layer.labData.cr} onChange={(e) => updateLayerLabData(layer.id, 'cr', Number(e.target.value))} />
                                  <input type="number" placeholder="Cv" title="Coeff. of Consolidation" className="bg-yellow-50 text-yellow-800 rounded p-1 text-xs text-center" value={layer.labData.cv} onChange={(e) => updateLayerLabData(layer.id, 'cv', Number(e.target.value))} />
                                  <input type="number" placeholder="Cα" title="Secondary Compression Index (C-alpha)" className="bg-purple-50 text-purple-800 rounded p-1 text-xs text-center border border-purple-100" value={layer.labData.cAlpha} onChange={(e) => updateLayerLabData(layer.id, 'cAlpha', Number(e.target.value))} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <button onClick={addLayer} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                      + Add Soil Layer
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ACTION BUTTON */}
            <button
              onClick={handleAnalysis}
              disabled={loading}
              className={`w-full py-5 rounded-2xl font-black text-lg tracking-wide shadow-xl transform transition-all active:scale-95 flex items-center justify-center gap-3 relative overflow-hidden group
                ${loading ? 'bg-slate-300 cursor-not-allowed text-slate-500' : 'bg-slate-900 text-white hover:shadow-2xl hover:shadow-indigo-500/30'}
              `}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <span className="relative z-10 flex items-center gap-2">
                {loading ? <span className="animate-spin">⏳</span> : '⚡'}
                {loading ? (lang === 'ar' ? 'جاري التحليل...' : 'ANALYZING...') : (lang === 'ar' ? 'بدء التحليل' : 'RUN ANALYSIS')}
              </span>
            </button>
          </div>

          {/* CENTER: VISUALIZATION & RESULTS */}
          <div className="xl:col-span-8 space-y-8">

            {/* Soil Vis */}
            <div className="glass-panel p-2 rounded-3xl shadow-sm border border-white no-print">
              <div className="bg-slate-50 rounded-[20px] p-6 relative min-h-[400px]">
                <SoilVisualizer layers={layers} gwtDepth={foundation.groundwaterDepth} lang={lang} />

                {/* Overlay Foundation Box */}
                <div
                  className={`absolute top-6 left-1/2 transform -translate-x-1/2 bg-slate-900/90 border border-white/20 text-white flex flex-col items-center justify-center text-[10px] z-20 backdrop-blur-sm shadow-xl transition-all duration-500 ${foundation.type === 'circular' ? 'rounded-full' : 'rounded-b-lg'}`}
                  style={{
                    width: foundation.type === 'circular' ? '120px' : '40%',
                    height: foundation.type === 'circular' ? '40px' : `${Math.max(foundation.depth * 30, 40)}px`,
                    transform: `translate(-50%, 0) rotate(${foundation.slopeAngle || 0}deg)`
                  }}
                >
                  <span className="font-bold tracking-widest uppercase opacity-70">
                    {foundation.type === 'circular' ? 'Circular' : 'Footing'}
                  </span>
                  <div className="flex gap-2">
                    <span className="font-mono text-indigo-300">{foundation.load}kN</span>
                    {foundation.moment ? <span className="font-mono text-yellow-300">M={foundation.moment}</span> : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Results Placeholder (Since results are now in a modal) */}
            <div className="min-h-[200px] flex items-center justify-center text-center opacity-40">
              <div>
                <div className="text-4xl mb-2">👈</div>
                <p className="font-bold text-slate-500">Configure parameters on the left and click Run Analysis</p>
                <p className="text-xs text-slate-400">Results will open in a new window</p>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

export default App;