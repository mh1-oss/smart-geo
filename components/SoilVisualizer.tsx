import React from 'react';
import { SoilLayer, SoilType, Language } from '../types';

interface Props {
  layers: SoilLayer[];
  gwtDepth: number;
  lang: Language;
}

const getSoilGradient = (type: SoilType) => {
  switch (type) {
    case SoilType.Sand: return 'linear-gradient(45deg, #fef3c7 25%, #fde68a 25%, #fde68a 50%, #fef3c7 50%, #fef3c7 75%, #fde68a 75%, #fde68a 100%)';
    case SoilType.Clay: return 'linear-gradient(to bottom, #7c2d12, #9a3412)'; 
    case SoilType.Silt: return 'repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 5px, #d1d5db 5px, #d1d5db 10px)';
    case SoilType.Gravel: return 'radial-gradient(circle, #94a3b8 20%, transparent 20%), #cbd5e1';
    case SoilType.Rock: return 'linear-gradient(to right, #1f2937, #374151)';
    default: return '#f3f4f6';
  }
};

const getSoilClass = (type: SoilType) => {
    switch (type) {
        case SoilType.Sand: return 'opacity-80 bg-[length:10px_10px]';
        case SoilType.Clay: return 'opacity-90';
        case SoilType.Silt: return 'opacity-80';
        case SoilType.Gravel: return 'bg-[length:12px_12px]';
        default: return '';
    }
}

export const SoilVisualizer: React.FC<Props> = ({ layers, gwtDepth, lang }) => {
  const totalDepth = layers.length > 0 ? layers[layers.length - 1].depthTo : 10;
  
  const labels = {
    groundLevel: lang === 'ar' ? 'سطح الأرض (0.0m)' : 'Ground Level (0.0m)',
    gwt: lang === 'ar' ? 'GWT' : 'GWT',
    foundation: lang === 'ar' ? 'الأساس' : 'Foundation'
  };

  return (
    <div className="w-full h-full min-h-[350px] bg-white relative rounded-xl overflow-hidden shadow-inner border border-slate-200">
        {/* Technical Grid Background Inside */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

        {/* Ground Surface */}
        <div className="absolute top-0 w-full border-t-[3px] border-slate-800 z-10 flex items-start">
             <div className="h-2 w-full bg-gradient-to-b from-slate-300 to-transparent opacity-30"></div>
             <span className="absolute -top-6 right-2 text-slate-600 font-bold text-[10px] uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{labels.groundLevel}</span>
        </div>

        {/* Soil Layers */}
        {layers.map((layer) => {
            const heightPercentage = ((layer.depthTo - layer.depthFrom) / totalDepth) * 100;
            return (
                <div 
                    key={layer.id}
                    className="w-full absolute flex items-center justify-center transition-all duration-700 ease-in-out border-b border-slate-900/10 group"
                    style={{
                        top: `${(layer.depthFrom / totalDepth) * 100}%`,
                        height: `${heightPercentage}%`,
                        background: getSoilGradient(layer.type),
                    }}
                >
                    <div className={`absolute inset-0 ${getSoilClass(layer.type)}`}></div>
                    
                    {/* Layer Label Tag */}
                    <div className="bg-white/95 px-3 py-1.5 rounded-full shadow-lg text-slate-800 backdrop-blur-md relative z-20 text-center border border-slate-100 transform group-hover:scale-110 transition-transform cursor-crosshair flex flex-col items-center gap-0.5">
                        <span className="text-xs font-black uppercase tracking-tight">{layer.type}</span>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                           <span className="font-bold text-indigo-600">N={layer.sptN}</span>
                           <span className="w-px h-3 bg-slate-300"></span>
                           <span>{layer.depthTo}m</span>
                        </div>
                    </div>
                </div>
            )
        })}

        {/* Groundwater Table */}
        {gwtDepth <= totalDepth && (
           <div 
             className="absolute w-full z-30 transition-all duration-1000 ease-spring"
             style={{ top: `${(gwtDepth / totalDepth) * 100}%` }}
           >
             <div className="absolute w-full border-t-2 border-dashed border-blue-500 opacity-70"></div>
             <div className="absolute right-0 -top-3 flex items-center gap-1 pr-2">
               <span className="text-blue-500 text-lg">▼</span>
               <span className="text-white text-[10px] font-bold bg-blue-500 px-1.5 py-0.5 rounded shadow-sm">{labels.gwt} {gwtDepth}m</span>
             </div>
             <div className="w-full h-[1000px] bg-blue-500/10 backdrop-blur-[0.5px] pointer-events-none"></div>
           </div>
        )}
        
        {/* Technical Ruler */}
        <div className="absolute left-0 top-0 h-full w-10 bg-slate-50/90 border-r border-slate-300 flex flex-col justify-between py-1 text-[9px] font-mono text-slate-500 text-center z-40 select-none shadow-sm">
             {[...Array(11)].map((_, i) => (
               <div key={i} className="w-full flex justify-end items-center pr-1 relative">
                 <span className="mr-1">{((i/10) * totalDepth).toFixed(1)}</span>
                 <div className="w-2 h-px bg-slate-400"></div>
               </div>
             ))}
        </div>
    </div>
  );
};