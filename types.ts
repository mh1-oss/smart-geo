export type Language = 'ar' | 'en';

export enum SoilType {
  Sand = 'Sand',
  Clay = 'Clay',
  Silt = 'Silt',
  Gravel = 'Gravel',
  Rock = 'Rock'
}

export interface ManualLabData {
  useManual: boolean;
  unitWeight?: number; // gamma
  cohesion?: number; // c
  frictionAngle?: number; // phi
  elasticModulus?: number; // E
  poissonsRatio?: number; // nu
  cc?: number; // Compression Index
  cr?: number; // Recompression Index
  cv?: number; // Coefficient of Consolidation
  cAlpha?: number; // Secondary Compression Index (New)
}

export interface SoilLayer {
  id: string;
  depthFrom: number;
  depthTo: number;
  type: SoilType;
  sptN: number;
  labData: ManualLabData;
}

export interface FoundationData {
  width: number; // B
  length: number; // L
  diameter?: number; 
  depth: number; // Df
  load: number; // Applied Load (kN)
  moment?: number; // Applied Moment (kN.m)
  type: 'isolated' | 'raft' | 'strip' | 'circular';
  shapeFactor?: number;
  groundwaterDepth: number; 
  concreteGrade: number; // fc' in MPa
  steelGrade: number; // fy in MPa
  slopeAngle?: number; // Slope inclination in degrees
  targetFos: number; // User defined Target Factor of Safety (New)
}

export interface CalibrationRecord {
  id: string;
  soilType: SoilType;
  sptN: number;
  actualPhi?: number;
  actualC?: number;
  actualE?: number;
  description: string;
}

export interface SimulationPoint {
  x: number;
  y: number;
}

export interface StressNode {
  x: number; 
  z: number; 
  stress: number; 
}

export interface AnalysisResult {
  timestamp: number; // For history
  layers: {
    depth: string;
    description: string;
    params: {
      gamma: number;
      phi: number;
      c: number;
      E: number;
      shearStrengthAtBottom: number;
      consolidation?: {
        cc: number;
        cr: number;
        cv: number;
        cAlpha: number;
      };
    };
  }[];
  bearingCapacity: {
    method: 'Vesic';
    q_ult: number;
    q_allow: number; // Based on targetFos
    factors: { Nc: number; Nq: number; Ngamma: number };
    factorOfSafety: number; // Actual FOS
  };
  settlement: {
    method: 'Schmertmann + Consolidation';
    total: number;
    primary: number;
    secondary: number; // Secondary Consolidation
    elastic: number;
    timeToMaxSettlement: string; // e.g. "5.2 years"
    status: 'Safe' | 'Warning' | 'Failure';
  };
  slopeStability?: { // New Slope Analysis
    factorOfSafety: number;
    status: 'Stable' | 'Unstable';
    method: string; // e.g., Bishop or Fellenius
    notes: string;
  };
  foundationDesign: { // Structural Design
    minThickness: number; // meters
    reinforcementArea: number; // mm2/m
    barSuggestion: string; // e.g. "20mm @ 150mm c/c"
    punchingShearCheck: 'Safe' | 'Unsafe';
    notes: string;
  };
  femAnalysis: {
    maxDisplacement: number;
    maxVonMisesStress: number;
    plasticPoints: string;
    meshNodes: number;
    stressMesh: StressNode[]; 
  };
  recommendations: {
    solutions: string[]; 
    riskLevel: 'Low' | 'Medium' | 'High';
  };
  graphs: {
    loadSettlement: SimulationPoint[];
    shearStrength: SimulationPoint[];
    timeSettlement: SimulationPoint[]; // Time vs Settlement
  };
  doctorReport: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AnalysisHistoryItem {
  id: string;
  date: string;
  foundationType: string;
  load: number;
  result: AnalysisResult;
}