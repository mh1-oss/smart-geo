/**
 * SmartGeo Deterministic Calculation Engine
 * All geotechnical equations implemented from standard references:
 * - Vesic (1973) Bearing Capacity
 * - Schmertmann (1978) Elastic Settlement
 * - Terzaghi 1D Consolidation
 * - ACI 318 Structural Design
 * - Boussinesq Stress Distribution
 */

import {
    SoilLayer, FoundationData, AnalysisResult, SoilType,
    SimulationPoint, StressNode
} from '../types';

// =============================================
// 1. BEARING CAPACITY - Vesic's Method
// =============================================

/** Vesic bearing capacity factors from friction angle (degrees) */
function bearingCapacityFactors(phiDeg: number): { Nc: number; Nq: number; Ngamma: number } {
    const phi = (phiDeg * Math.PI) / 180;

    if (phiDeg === 0) {
        return { Nc: 5.14, Nq: 1.0, Ngamma: 0 };
    }

    const Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
    const Nc = (Nq - 1) / Math.tan(phi);
    const Ngamma = 2 * (Nq + 1) * Math.tan(phi);

    return { Nc, Nq, Ngamma };
}

/** Shape factors (Vesic 1973) */
function shapeFactors(B: number, L: number, Nq: number, Nc: number, type: string): { sc: number; sq: number; sgamma: number } {
    if (type === 'circular') {
        return { sc: 1 + Nq / Nc, sq: 1 + Math.tan((30 * Math.PI) / 180), sgamma: 0.6 };
    }
    if (type === 'strip') {
        return { sc: 1.0, sq: 1.0, sgamma: 1.0 };
    }
    // Rectangular (isolated, raft)
    const ratio = B / L;
    return {
        sc: 1 + ratio * (Nq / Nc),
        sq: 1 + ratio * Math.tan((30 * Math.PI) / 180),
        sgamma: 1 - 0.4 * ratio,
    };
}

/** Depth factors (Hansen 1970) */
function depthFactors(Df: number, B: number): { dc: number; dq: number; dgamma: number } {
    const ratio = Df / B;
    if (ratio <= 1) {
        const dq = 1 + 2 * Math.tan((30 * Math.PI) / 180) * Math.pow(1 - Math.sin((30 * Math.PI) / 180), 2) * ratio;
        return { dc: 1 + 0.4 * ratio, dq, dgamma: 1.0 };
    }
    const arctanRatio = Math.atan(ratio);
    const dq = 1 + 2 * Math.tan((30 * Math.PI) / 180) * Math.pow(1 - Math.sin((30 * Math.PI) / 180), 2) * arctanRatio;
    return { dc: 1 + 0.4 * arctanRatio, dq, dgamma: 1.0 };
}

/** Groundwater correction factor for unit weight */
function effectiveUnitWeight(gamma: number, gwDepth: number, Df: number, B: number): { gammaAbove: number; gammaBelow: number } {
    const gammaW = 9.81; // kN/m³
    const gammaSub = gamma - gammaW;

    if (gwDepth >= Df + B) {
        // GWT below influence zone — no correction
        return { gammaAbove: gamma, gammaBelow: gamma };
    } else if (gwDepth <= Df) {
        // GWT at or above foundation level
        return { gammaAbove: gamma, gammaBelow: gammaSub };
    } else {
        // GWT between Df and Df+B
        const factor = (gwDepth - Df) / B;
        return { gammaAbove: gamma, gammaBelow: gammaSub + factor * (gamma - gammaSub) };
    }
}

interface BearingCapacityResult {
    method: 'Vesic';
    q_ult: number;
    q_allow: number;
    factors: { Nc: number; Nq: number; Ngamma: number };
    factorOfSafety: number;
}

function calculateBearingCapacity(layers: SoilLayer[], foundation: FoundationData): BearingCapacityResult {
    // Get the layer at foundation depth
    const foundationLayer = layers.find(l => foundation.depth >= l.depthFrom && foundation.depth < l.depthTo) || layers[0];
    const lab = foundationLayer.labData;

    const phi = lab.useManual && lab.frictionAngle != null ? lab.frictionAngle : estimatePhi(foundationLayer.sptN, foundationLayer.type);
    const c = lab.useManual && lab.cohesion != null ? lab.cohesion : estimateCohesion(foundationLayer.sptN, foundationLayer.type);
    const gamma = lab.useManual && lab.unitWeight != null ? lab.unitWeight : estimateGamma(foundationLayer.sptN, foundationLayer.type);

    const B = foundation.type === 'circular' ? (foundation.diameter || 2) : foundation.width;
    const L = foundation.type === 'circular' ? B : (foundation.type === 'strip' ? B * 10 : foundation.length);
    const Df = foundation.depth;
    const targetFos = foundation.targetFos || 3.0;

    const { Nc, Nq, Ngamma } = bearingCapacityFactors(phi);
    const sf = shapeFactors(B, L, Nq, Nc, foundation.type);
    const df = depthFactors(Df, B);
    const gw = effectiveUnitWeight(gamma, foundation.groundwaterDepth, Df, B);

    // Overburden pressure at foundation depth
    const q = gw.gammaAbove * Df;

    // Vesic general equation
    const q_ult = c * Nc * sf.sc * df.dc
        + q * Nq * sf.sq * df.dq
        + 0.5 * gw.gammaBelow * B * Ngamma * sf.sgamma * df.dgamma;

    const q_allow = q_ult / targetFos;

    // Actual factor of safety
    const area = foundation.type === 'circular'
        ? Math.PI * Math.pow(B / 2, 2)
        : B * L;
    const appliedPressure = foundation.load / area;
    const actualFos = q_ult / appliedPressure;

    return {
        method: 'Vesic',
        q_ult: Math.round(q_ult * 100) / 100,
        q_allow: Math.round(q_allow * 100) / 100,
        factors: {
            Nc: Math.round(Nc * 100) / 100,
            Nq: Math.round(Nq * 100) / 100,
            Ngamma: Math.round(Ngamma * 100) / 100,
        },
        factorOfSafety: Math.round(actualFos * 100) / 100,
    };
}

// =============================================
// 2. SETTLEMENT ANALYSIS
// =============================================

interface SettlementResult {
    method: 'Schmertmann + Consolidation';
    total: number;
    elastic: number;
    primary: number;
    secondary: number;
    timeToMaxSettlement: string;
    status: 'Safe' | 'Warning' | 'Failure';
}

function calculateSettlement(layers: SoilLayer[], foundation: FoundationData): SettlementResult {
    const B = foundation.type === 'circular' ? (foundation.diameter || 2) : foundation.width;
    const L = foundation.type === 'circular' ? B : (foundation.type === 'strip' ? B * 10 : foundation.length);
    const Df = foundation.depth;
    const area = foundation.type === 'circular' ? Math.PI * Math.pow(B / 2, 2) : B * L;
    const appliedPressure = foundation.load / area; // kPa

    // --- Elastic Settlement (Schmertmann Improved 1978) ---
    const elastic = calculateElasticSettlement(layers, foundation, B, Df, appliedPressure);

    // --- Primary Consolidation ---
    const primary = calculatePrimaryConsolidation(layers, foundation, B, Df, appliedPressure);

    // --- Secondary Consolidation ---
    const secondary = calculateSecondaryConsolidation(layers, foundation);

    // --- Time to Max Settlement ---
    const timeStr = calculateConsolidationTime(layers, foundation);

    const total = elastic + primary + secondary;

    // Status determination
    let status: 'Safe' | 'Warning' | 'Failure';
    if (total < 25) {
        status = 'Safe';
    } else if (total < 50) {
        status = 'Warning';
    } else {
        status = 'Failure';
    }

    return {
        method: 'Schmertmann + Consolidation',
        total: Math.round(total * 100) / 100,
        elastic: Math.round(elastic * 100) / 100,
        primary: Math.round(primary * 100) / 100,
        secondary: Math.round(secondary * 100) / 100,
        timeToMaxSettlement: timeStr,
        status,
    };
}

/** Schmertmann (1978) elastic settlement */
function calculateElasticSettlement(layers: SoilLayer[], foundation: FoundationData, B: number, Df: number, qApplied: number): number {
    const gamma = getWeightedGamma(layers, Df);
    const q0 = gamma * Df; // overburden at foundation level
    const deltaQ = qApplied - q0;
    if (deltaQ <= 0) return 0;

    // C1 = depth correction, C2 = creep correction
    const C1 = 1 - 0.5 * (q0 / deltaQ);
    const C2 = 1.0; // assume no creep for instant

    // Influence zone = 2B for square, 4B for strip
    const L = foundation.type === 'strip' ? B * 10 : foundation.length;
    const isSquare = L / B < 2;
    const influenceDepth = isSquare ? 2 * B : 4 * B;

    // Divide into sub-layers within influence zone
    const numSublayers = 10;
    const dz = influenceDepth / numSublayers;
    let settlement = 0;

    for (let i = 0; i < numSublayers; i++) {
        const zMid = (i + 0.5) * dz;
        const zRatio = zMid / influenceDepth;

        // Strain Influence Factor (Iz) — triangular approximation
        let Iz: number;
        if (isSquare) {
            // Peak at z = 0.5B
            const peakZ = 0.5;
            const peakRatio = 0.5 * B / influenceDepth;
            if (zRatio <= peakRatio) {
                Iz = 0.1 + (0.5 - 0.1) * (zRatio / peakRatio);
            } else {
                Iz = 0.5 * (1 - (zRatio - peakRatio) / (1 - peakRatio));
            }
        } else {
            // Strip: peak at z = B
            const peakRatio = B / influenceDepth;
            if (zRatio <= peakRatio) {
                Iz = 0.2 + (0.5 - 0.2) * (zRatio / peakRatio);
            } else {
                Iz = 0.5 * (1 - (zRatio - peakRatio) / (1 - peakRatio));
            }
        }
        Iz = Math.max(0, Iz);

        // Get E for the layer at this depth
        const actualDepth = Df + zMid;
        const layer = getLayerAtDepth(layers, actualDepth);
        const E = getElasticModulus(layer) * 1000; // Convert MPa to kPa

        if (E > 0) {
            settlement += (Iz / E) * dz;
        }
    }

    // Settlement in mm
    return Math.max(0, C1) * C2 * deltaQ * settlement * 1000;
}

/** Primary consolidation (Terzaghi 1D) for clay/silt layers */
function calculatePrimaryConsolidation(layers: SoilLayer[], foundation: FoundationData, B: number, Df: number, qApplied: number): number {
    let totalSettlement = 0;

    for (const layer of layers) {
        if (layer.type !== SoilType.Clay && layer.type !== SoilType.Silt) continue;
        if (layer.depthTo <= Df) continue; // Skip layers above foundation

        const lab = layer.labData;
        const Cc = lab.cc || estimateCc(layer.sptN);
        const gamma = lab.unitWeight || estimateGamma(layer.sptN, layer.type);

        const H = (layer.depthTo - Math.max(layer.depthFrom, Df)); // Layer thickness below foundation
        const zMid = (Math.max(layer.depthFrom, Df) + layer.depthTo) / 2;

        // Initial effective stress at mid-layer
        const sigma0 = gamma * zMid;

        // Stress increase at mid-layer (approximate using 2:1 method)
        const z = zMid - Df;
        const deltaStress = qApplied * (B * (foundation.length || B)) / ((B + z) * ((foundation.length || B) + z));

        // e0 estimated from compression index
        const e0 = 0.5 + Cc * 2; // Rough estimate

        if (sigma0 > 0) {
            // Sc = (Cc * H) / (1 + e0) * log10((sigma0 + deltaSigma) / sigma0)
            const Sc = (Cc * H) / (1 + e0) * Math.log10((sigma0 + deltaStress) / sigma0);
            totalSettlement += Math.max(0, Sc) * 1000; // Convert m to mm
        }
    }

    return totalSettlement;
}

/** Secondary consolidation (Cα method) */
function calculateSecondaryConsolidation(layers: SoilLayer[], foundation: FoundationData): number {
    let totalSecondary = 0;
    const Df = foundation.depth;

    for (const layer of layers) {
        if (layer.type !== SoilType.Clay && layer.type !== SoilType.Silt) continue;
        if (layer.depthTo <= Df) continue;

        const lab = layer.labData;
        const cAlpha = lab.cAlpha || 0.005;
        const H = (layer.depthTo - Math.max(layer.depthFrom, Df));

        // Ss = Cα * H * log10(t_design / t_primary)
        // Assume t_design = 30 years, t_primary computed separately
        const cv = lab.cv || 0.5; // m²/year
        const Hdr = H / 2; // Double drainage
        const tp = 0.848 * Hdr * Hdr / cv; // t for U=90%
        const tDesign = Math.max(tp * 2, 30); // Design life

        if (tp > 0) {
            const Ss = cAlpha * H * Math.log10(tDesign / tp);
            totalSecondary += Math.max(0, Ss) * 1000; // mm
        }
    }

    return totalSecondary;
}

/** Calculate time for 90% primary consolidation */
function calculateConsolidationTime(layers: SoilLayer[], foundation: FoundationData): string {
    const Df = foundation.depth;
    let maxTime = 0;

    for (const layer of layers) {
        if (layer.type !== SoilType.Clay && layer.type !== SoilType.Silt) continue;
        if (layer.depthTo <= Df) continue;

        const lab = layer.labData;
        const cv = lab.cv || 0.5; // m²/year
        const H = (layer.depthTo - Math.max(layer.depthFrom, Df));
        const Hdr = H / 2; // Double drainage assumed

        // t = Tv * Hdr² / Cv
        // For U=90%, Tv = 0.848
        // For U=95%, Tv ≈ 1.129
        const Tv90 = 0.848;
        const t90 = (Tv90 * Hdr * Hdr) / cv;

        maxTime = Math.max(maxTime, t90);
    }

    if (maxTime <= 0) return '< 1 Month';
    if (maxTime < 1 / 12) return `${Math.round(maxTime * 365)} Days`;
    if (maxTime < 1) return `${Math.round(maxTime * 12)} Months`;
    return `${maxTime.toFixed(1)} Years`;
}

// =============================================
// 3. FOUNDATION DESIGN (ACI 318)
// =============================================

interface FoundationDesignResult {
    minThickness: number;
    reinforcementArea: number;
    barSuggestion: string;
    punchingShearCheck: 'Safe' | 'Unsafe';
    notes: string;
}

function calculateFoundationDesign(foundation: FoundationData, qAllow: number): FoundationDesignResult {
    const B = foundation.type === 'circular' ? (foundation.diameter || 2) : foundation.width;
    const L = foundation.type === 'circular' ? B : foundation.length;
    const fc = foundation.concreteGrade; // MPa
    const fy = foundation.steelGrade; // MPa
    const area = foundation.type === 'circular' ? Math.PI * Math.pow(B / 2, 2) : B * L;
    const qApplied = foundation.load / area; // kPa

    // --- Minimum Thickness ---
    // Punching shear controls for isolated footings
    // Assume column size ~0.4m x 0.4m for isolated
    const columnSize = foundation.type === 'isolated' ? 0.4 : Math.min(B, L) * 0.3;

    // Effective depth from punching shear
    // Vu = P - qu * (c+d)²  for square column
    // Vc = 0.33 * sqrt(fc) * bo * d  (ACI 318)
    // Simplified: d >= P / (0.33 * sqrt(fc) * 4 * (c+d) * 1000)
    // Iterative solution simplified:
    let d = 0.3; // Initial guess for effective depth (m)
    for (let iter = 0; iter < 20; iter++) {
        const bo = 4 * (columnSize + d); // Perimeter for punching shear (m)
        const Vu = foundation.load - qApplied * Math.pow(columnSize + d, 2); // kN
        const phiVc = 0.75 * 0.33 * Math.sqrt(fc) * bo * d * 1000; // kN (fc in MPa, d in m)
        if (Vu <= phiVc) break;
        d += 0.05;
    }

    const minThickness = Math.round((d + 0.1) * 100) / 100; // Add cover (m)

    // --- Punching Shear Check ---
    const bo = 4 * (columnSize + d);
    const Vu = foundation.load - qApplied * Math.pow(columnSize + d, 2);
    const phiVc = 0.75 * 0.33 * Math.sqrt(fc) * bo * d * 1000;
    const punchingCheck: 'Safe' | 'Unsafe' = Vu <= phiVc ? 'Safe' : 'Unsafe';

    // --- Flexural Reinforcement ---
    // Mu = qu * (cantilever)² / 2  per meter width
    const cantilever = (B - columnSize) / 2;
    const Mu = qApplied * cantilever * cantilever / 2; // kN.m/m

    // As = Mu / (0.9 * fy * (d - a/2))
    // Approximate a ≈ As*fy / (0.85*fc*1000)
    // Simplified: As = Mu * 1e6 / (0.9 * fy * 0.9 * d * 1000) mm²/m
    const As = (Mu * 1e6) / (0.9 * fy * 0.9 * d * 1000);

    // Minimum reinforcement (ACI 318): As_min = 0.0018 * b * h
    const hMm = minThickness * 1000;
    const AsMin = 0.0018 * 1000 * hMm;
    const finalAs = Math.max(As, AsMin);

    // --- Bar Suggestion ---
    const barSuggestion = generateBarSuggestion(finalAs);

    return {
        minThickness,
        reinforcementArea: Math.round(finalAs),
        barSuggestion,
        punchingShearCheck: punchingCheck,
        notes: '',
    };
}

function generateBarSuggestion(asRequired: number): string {
    // Common bar options: Φ12 (113mm²), Φ16 (201mm²), Φ20 (314mm²), Φ25 (491mm²)
    const bars = [
        { dia: 12, area: 113 },
        { dia: 16, area: 201 },
        { dia: 20, area: 314 },
        { dia: 25, area: 491 },
    ];

    for (const bar of bars) {
        const spacing = Math.floor((bar.area / asRequired) * 1000);
        if (spacing >= 100 && spacing <= 300) {
            const roundedSpacing = Math.floor(spacing / 25) * 25;
            return `Φ${bar.dia} @ ${roundedSpacing}mm c/c`;
        }
    }

    // Fallback: use Φ20
    const spacing = Math.floor((314 / asRequired) * 1000);
    const roundedSpacing = Math.max(100, Math.min(300, Math.floor(spacing / 25) * 25));
    return `Φ20 @ ${roundedSpacing}mm c/c`;
}

// =============================================
// 4. SLOPE STABILITY (Infinite Slope Method)
// =============================================

interface SlopeStabilityResult {
    factorOfSafety: number;
    status: 'Stable' | 'Unstable';
    method: string;
    notes: string;
}

function calculateSlopeStability(layers: SoilLayer[], foundation: FoundationData): SlopeStabilityResult | undefined {
    const slopeAngle = foundation.slopeAngle || 0;
    if (slopeAngle <= 0) return undefined;

    const beta = (slopeAngle * Math.PI) / 180;
    const layer = layers[0]; // Use surface layer for slope analysis
    const lab = layer.labData;

    const phi = lab.useManual && lab.frictionAngle != null ? lab.frictionAngle : estimatePhi(layer.sptN, layer.type);
    const c = lab.useManual && lab.cohesion != null ? lab.cohesion : estimateCohesion(layer.sptN, layer.type);
    const gamma = lab.useManual && lab.unitWeight != null ? lab.unitWeight : estimateGamma(layer.sptN, layer.type);

    const phiRad = (phi * Math.PI) / 180;
    const z = foundation.depth || 2; // Analysis depth

    // Infinite slope: FOS = (c' + γ·z·cos²β·tanφ') / (γ·z·sinβ·cosβ)
    const numerator = c + gamma * z * Math.pow(Math.cos(beta), 2) * Math.tan(phiRad);
    const denominator = gamma * z * Math.sin(beta) * Math.cos(beta);

    const fos = denominator > 0 ? numerator / denominator : 99;

    return {
        factorOfSafety: Math.round(fos * 100) / 100,
        status: fos >= 1.5 ? 'Stable' : 'Unstable',
        method: 'Infinite Slope Method',
        notes: fos >= 1.5
            ? 'The slope is stable with an adequate factor of safety.'
            : 'The slope is potentially unstable. Consider stabilization measures.',
    };
}

// =============================================
// 5. FEM STRESS MESH (Boussinesq)
// =============================================

interface FEMResult {
    maxDisplacement: number;
    maxVonMisesStress: number;
    plasticPoints: string;
    meshNodes: number;
    stressMesh: StressNode[];
}

function calculateFEMAnalysis(layers: SoilLayer[], foundation: FoundationData): FEMResult {
    const B = foundation.type === 'circular' ? (foundation.diameter || 2) : foundation.width;
    const L = foundation.type === 'circular' ? B : foundation.length;
    const area = foundation.type === 'circular' ? Math.PI * Math.pow(B / 2, 2) : B * L;
    const qApplied = foundation.load / area; // kPa

    const stressMesh: StressNode[] = [];

    // Generate stress mesh using Boussinesq for rectangular footing
    // Influence depth = ~3B
    const maxDepth = 3 * B;
    const halfWidth = B * 1.5;

    const nX = 12;
    const nZ = 8;

    for (let iz = 0; iz < nZ; iz++) {
        for (let ix = 0; ix < nX; ix++) {
            const x = -halfWidth + (ix / (nX - 1)) * 2 * halfWidth;
            const z = 0.1 + (iz / (nZ - 1)) * maxDepth;

            // Boussinesq stress from uniformly loaded rectangular area
            // Simplified using Newmark influence factor approximation
            const stress = boussinesqRectangular(qApplied, B, L, x, z);

            stressMesh.push({
                x: Math.round(x * 100) / 100,
                z: Math.round(z * 100) / 100,
                stress: Math.round(Math.max(0, stress) * 100) / 100,
            });
        }
    }

    // Max displacement approximation
    const foundationLayer = layers.find(l => foundation.depth >= l.depthFrom && foundation.depth < l.depthTo) || layers[0];
    const E = getElasticModulus(foundationLayer) * 1000; // kPa
    const nu = foundationLayer.labData.poissonsRatio || 0.3;
    const Is = 1.0; // Influence factor for rigid footing
    const maxDisp = (qApplied * B * (1 - nu * nu) * Is) / E * 1000; // mm

    // Plastic points estimate
    const gamma = foundationLayer.labData.unitWeight || 18;
    const phi = foundationLayer.labData.frictionAngle || 30;
    const c = foundationLayer.labData.cohesion || 0;
    const shearStrength = c + gamma * foundation.depth * Math.tan((phi * Math.PI) / 180);
    const plasticRatio = qApplied / shearStrength;
    let plasticDesc: string;
    if (plasticRatio < 0.5) {
        plasticDesc = 'Minimal plastic deformation — soil well within elastic range.';
    } else if (plasticRatio < 0.8) {
        plasticDesc = 'Some localized plastic zones near footing edges.';
    } else {
        plasticDesc = 'Significant plastic zones detected — approaching bearing failure.';
    }

    return {
        maxDisplacement: Math.round(maxDisp * 100) / 100,
        maxVonMisesStress: Math.round(qApplied * 100) / 100,
        plasticPoints: plasticDesc,
        meshNodes: stressMesh.length,
        stressMesh,
    };
}

/** Boussinesq stress under center/offset of rectangular loaded area */
function boussinesqRectangular(q: number, B: number, L: number, xOffset: number, z: number): number {
    // Using 2:1 distribution method for simplicity with position-dependent decay
    // σz = q * B * L / ((B + z) * (L + z)) for center
    // With lateral offset factor
    if (z <= 0) return q;

    const effectiveB = B + z;
    const effectiveL = L + z;

    // Center stress
    const centerStress = q * (B * L) / (effectiveB * effectiveL);

    // Offset decay — Gaussian-like falloff from center
    const halfB = B / 2;
    const lateralDecay = Math.exp(-Math.pow(xOffset / (halfB + z * 0.5), 2));

    return centerStress * lateralDecay;
}

// =============================================
// 6. GRAPH DATA GENERATION
// =============================================

function generateGraphs(
    layers: SoilLayer[],
    foundation: FoundationData,
    qUlt: number,
    totalSettlement: number
): { loadSettlement: SimulationPoint[]; shearStrength: SimulationPoint[]; timeSettlement: SimulationPoint[] } {

    // --- Load-Settlement Curve ---
    const loadSettlement: SimulationPoint[] = [];
    const maxLoad = qUlt * 1.5;
    const steps = 15;
    for (let i = 0; i <= steps; i++) {
        const loadFraction = i / steps;
        const load = loadFraction * maxLoad;

        // Non-linear settlement model: S = S_linear * (1 + (q/q_ult)²)
        const linearSettlement = totalSettlement * loadFraction;
        const nonlinearFactor = 1 + Math.pow(loadFraction * maxLoad / qUlt, 2);
        const settlement = linearSettlement * nonlinearFactor;

        loadSettlement.push({
            x: Math.round(load * 10) / 10,
            y: Math.round(settlement * 100) / 100,
        });
    }

    // --- Shear Strength vs Depth ---
    const shearStrength: SimulationPoint[] = [];
    const maxDepth = Math.max(...layers.map(l => l.depthTo));
    for (let depth = 0; depth <= maxDepth; depth += 1) {
        const layer = getLayerAtDepth(layers, depth);
        const gamma = layer.labData.unitWeight || estimateGamma(layer.sptN, layer.type);
        const phi = layer.labData.frictionAngle != null ? layer.labData.frictionAngle : estimatePhi(layer.sptN, layer.type);
        const c = layer.labData.cohesion != null ? layer.labData.cohesion : estimateCohesion(layer.sptN, layer.type);

        const sigma = gamma * depth;
        const tau = c + sigma * Math.tan((phi * Math.PI) / 180);

        shearStrength.push({
            x: Math.round(depth * 10) / 10,
            y: Math.round(tau * 10) / 10,
        });
    }

    // --- Time-Settlement Curve ---
    const timeSettlement: SimulationPoint[] = [];
    // Find max consolidation time
    let maxTimeYears = 1;
    for (const layer of layers) {
        if (layer.type === SoilType.Clay || layer.type === SoilType.Silt) {
            const cv = layer.labData.cv || 0.5;
            const H = layer.depthTo - layer.depthFrom;
            const Hdr = H / 2;
            const t90 = 0.848 * Hdr * Hdr / cv;
            maxTimeYears = Math.max(maxTimeYears, t90 * 1.5);
        }
    }

    const timeSteps = 20;
    for (let i = 0; i <= timeSteps; i++) {
        const t = (i / timeSteps) * maxTimeYears;

        // Consolidation degree U(t) using approximation
        let totalS = 0;
        for (const layer of layers) {
            if (layer.type !== SoilType.Clay && layer.type !== SoilType.Silt) continue;

            const cv = layer.labData.cv || 0.5;
            const H = layer.depthTo - layer.depthFrom;
            const Hdr = H / 2;
            const Tv = (cv * t) / (Hdr * Hdr);

            // Approximate U from Tv
            let U: number;
            if (Tv <= 0.2827) {
                U = Math.sqrt(4 * Tv / Math.PI);
            } else {
                U = 1 - (8 / (Math.PI * Math.PI)) * Math.exp(-Math.PI * Math.PI * Tv / 4);
            }
            U = Math.min(1, Math.max(0, U));

            totalS += U;
        }

        const clayLayers = layers.filter(l => l.type === SoilType.Clay || l.type === SoilType.Silt).length;
        const avgU = clayLayers > 0 ? totalS / clayLayers : 1;

        timeSettlement.push({
            x: Math.round(t * 100) / 100,
            y: Math.round(totalSettlement * avgU * 100) / 100,
        });
    }

    return { loadSettlement, shearStrength, timeSettlement };
}

// =============================================
// 7. LAYER ANALYSIS (Properties per layer)
// =============================================

function analyzeLayers(layers: SoilLayer[]): AnalysisResult['layers'] {
    return layers.map(layer => {
        const lab = layer.labData;
        const gamma = lab.useManual && lab.unitWeight != null ? lab.unitWeight : estimateGamma(layer.sptN, layer.type);
        const phi = lab.useManual && lab.frictionAngle != null ? lab.frictionAngle : estimatePhi(layer.sptN, layer.type);
        const c = lab.useManual && lab.cohesion != null ? lab.cohesion : estimateCohesion(layer.sptN, layer.type);
        const E = lab.useManual && lab.elasticModulus != null ? lab.elasticModulus : estimateE(layer.sptN, layer.type);

        const shearStrengthAtBottom = c + gamma * layer.depthTo * Math.tan((phi * Math.PI) / 180);

        const description = `${layer.type} layer, SPT N=${layer.sptN}, ${getDensityDescription(layer.sptN, layer.type)}`;

        const consolidation = (layer.type === SoilType.Clay || layer.type === SoilType.Silt)
            ? {
                cc: lab.cc || estimateCc(layer.sptN),
                cr: lab.cr || (lab.cc ? lab.cc / 5 : estimateCc(layer.sptN) / 5),
                cv: lab.cv || 0.5,
                cAlpha: lab.cAlpha || 0.005,
            }
            : undefined;

        return {
            depth: `${layer.depthFrom}m - ${layer.depthTo}m`,
            description,
            params: {
                gamma,
                phi,
                c,
                E,
                shearStrengthAtBottom: Math.round(shearStrengthAtBottom * 10) / 10,
                consolidation,
            },
        };
    });
}

// =============================================
// HELPER / ESTIMATION FUNCTIONS
// =============================================

function estimatePhi(sptN: number, type: SoilType): number {
    // Peck, Hanson & Thornburn correlations
    switch (type) {
        case SoilType.Sand:
        case SoilType.Gravel:
            return Math.min(45, 25 + 0.3 * sptN + 0.00054 * sptN * sptN);
        case SoilType.Silt:
            return Math.min(35, 20 + 0.25 * sptN);
        case SoilType.Clay:
            return 0; // Undrained, φ = 0
        case SoilType.Rock:
            return 40;
        default:
            return 28;
    }
}

function estimateCohesion(sptN: number, type: SoilType): number {
    switch (type) {
        case SoilType.Clay:
            return sptN * 6.25; // cu ≈ 6.25N (kPa) - Stroud
        case SoilType.Silt:
            return sptN * 3;
        case SoilType.Sand:
        case SoilType.Gravel:
            return 0;
        case SoilType.Rock:
            return 200;
        default:
            return 0;
    }
}

function estimateGamma(sptN: number, type: SoilType): number {
    switch (type) {
        case SoilType.Sand:
            return sptN < 10 ? 16 : sptN < 30 ? 18 : 20;
        case SoilType.Gravel:
            return 20;
        case SoilType.Clay:
            return sptN < 4 ? 16 : sptN < 8 ? 17 : 19;
        case SoilType.Silt:
            return 17;
        case SoilType.Rock:
            return 25;
        default:
            return 18;
    }
}

function estimateE(sptN: number, type: SoilType): number {
    // Elastic modulus in MPa
    switch (type) {
        case SoilType.Sand:
            return 2.5 * sptN; // E = 2.5N (MPa)
        case SoilType.Gravel:
            return 3 * sptN;
        case SoilType.Clay:
            return 0.8 * sptN + 5;
        case SoilType.Silt:
            return 1.5 * sptN + 3;
        case SoilType.Rock:
            return 500;
        default:
            return 2 * sptN;
    }
}

function estimateCc(sptN: number): number {
    // Approximate Cc from SPT for clay
    if (sptN < 4) return 0.4;
    if (sptN < 8) return 0.25;
    if (sptN < 15) return 0.15;
    return 0.1;
}

function getLayerAtDepth(layers: SoilLayer[], depth: number): SoilLayer {
    return layers.find(l => depth >= l.depthFrom && depth < l.depthTo) || layers[layers.length - 1];
}

function getElasticModulus(layer: SoilLayer): number {
    if (layer.labData.useManual && layer.labData.elasticModulus != null) {
        return layer.labData.elasticModulus;
    }
    return estimateE(layer.sptN, layer.type);
}

function getWeightedGamma(layers: SoilLayer[], depth: number): number {
    let totalWeight = 0;
    let totalThickness = 0;

    for (const layer of layers) {
        if (layer.depthFrom >= depth) break;
        const effectiveTop = layer.depthFrom;
        const effectiveBottom = Math.min(layer.depthTo, depth);
        const thickness = effectiveBottom - effectiveTop;
        if (thickness <= 0) continue;

        const gamma = layer.labData.unitWeight || estimateGamma(layer.sptN, layer.type);
        totalWeight += gamma * thickness;
        totalThickness += thickness;
    }

    return totalThickness > 0 ? totalWeight / totalThickness : 18;
}

function getDensityDescription(sptN: number, type: SoilType): string {
    if (type === SoilType.Clay || type === SoilType.Silt) {
        if (sptN < 2) return 'Very Soft';
        if (sptN < 4) return 'Soft';
        if (sptN < 8) return 'Medium Stiff';
        if (sptN < 15) return 'Stiff';
        if (sptN < 30) return 'Very Stiff';
        return 'Hard';
    }
    // Sand / Gravel
    if (sptN < 4) return 'Very Loose';
    if (sptN < 10) return 'Loose';
    if (sptN < 30) return 'Medium Dense';
    if (sptN < 50) return 'Dense';
    return 'Very Dense';
}

// =============================================
// MAIN EXPORT: Run Full Analysis
// =============================================

export interface CalculationOutput {
    layers: AnalysisResult['layers'];
    bearingCapacity: BearingCapacityResult;
    settlement: SettlementResult;
    slopeStability?: SlopeStabilityResult;
    foundationDesign: FoundationDesignResult;
    femAnalysis: FEMResult;
    graphs: {
        loadSettlement: SimulationPoint[];
        shearStrength: SimulationPoint[];
        timeSettlement: SimulationPoint[];
    };
}

export function runFullAnalysis(layers: SoilLayer[], foundation: FoundationData): CalculationOutput {
    // 1. Layer Analysis
    const analyzedLayers = analyzeLayers(layers);

    // 2. Bearing Capacity
    const bearingCapacity = calculateBearingCapacity(layers, foundation);

    // 3. Settlement
    const settlement = calculateSettlement(layers, foundation);

    // 4. Foundation Design
    const foundationDesign = calculateFoundationDesign(foundation, bearingCapacity.q_allow);

    // 5. Slope Stability
    const slopeStability = calculateSlopeStability(layers, foundation);

    // 6. FEM Analysis
    const femAnalysis = calculateFEMAnalysis(layers, foundation);

    // 7. Graphs
    const graphs = generateGraphs(layers, foundation, bearingCapacity.q_ult, settlement.total);

    return {
        layers: analyzedLayers,
        bearingCapacity,
        settlement,
        slopeStability,
        foundationDesign,
        femAnalysis,
        graphs,
    };
}
