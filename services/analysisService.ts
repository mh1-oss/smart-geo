
import { SoilLayer, FoundationData, CalibrationRecord, Language, AnalysisResult, SoilType } from "../types";
import { runFullAnalysis, CalculationOutput } from "./calculationEngine";

/**
 * Main analysis function (Purely Deterministic)
 * Does NOT depend on GoogleGenAI.
 */
export const analyzeSoilProfile = (
    layers: SoilLayer[],
    foundation: FoundationData,
    calibrationData: CalibrationRecord[],
    lang: Language
): AnalysisResult => {

    // Step 1: Run deterministic calculations (Instant)
    const calcResult = runFullAnalysis(layers, foundation);

    // Step 2: Generate Fallback Report (Instant)
    const fallback = generateFallbackReport(calcResult, lang);

    // Step 3: Return Immediate Result
    const result: AnalysisResult = {
        timestamp: Date.now(),
        layers: calcResult.layers,
        bearingCapacity: calcResult.bearingCapacity,
        settlement: calcResult.settlement,
        slopeStability: calcResult.slopeStability,
        foundationDesign: {
            ...calcResult.foundationDesign,
            notes: fallback.designNotes,
        },
        femAnalysis: calcResult.femAnalysis,
        recommendations: {
            solutions: fallback.recommendations.solutions,
            riskLevel: fallback.recommendations.riskLevel as 'Low' | 'Medium' | 'High',
        },
        graphs: calcResult.graphs,
        doctorReport: fallback.doctorReport,
        isAiGenerating: false,
    };

    return result;
};

/**
 * Generates a template-based report without AI
 */
export const generateFallbackReport = (data: CalculationOutput, lang: Language) => {
    const isAr = lang === 'ar';

    const solutions = data.foundationDesign.punchingShearCheck === 'Unsafe' || data.bearingCapacity.factorOfSafety < 3
        ? (isAr
            ? ["زيادة عمق التأسيس", "استخدام فرشة إحلال (Gravel Bedding)", "زيادة أبعاد الأساس"]
            : ["Increase foundation depth", "Use gravel bedding", "Increase footing dimensions"])
        : (isAr
            ? ["التأسيس آمن، لا توجد توصيات خاصة.", "متابعة الهبوط أثناء التنفيذ."]
            : ["Foundation is safe, no special measures.", "Monitor settlement during construction."]);

    const riskLevel = data.bearingCapacity.factorOfSafety < 1.5 ? 'High' : (data.bearingCapacity.factorOfSafety < 2.5 ? 'Medium' : 'Low');

    const doctorReport = isAr
        ? `## تقرير التحليل الجيوتقني
**التاريخ:** ${new Date().toLocaleDateString()}
**الحالة:** ${riskLevel === 'High' ? 'تحذير: مخاطر عالية' : 'مستقر'}

بناءً على البيانات المدخلة وطبقات التربة، تم حساب قدرة التحمل والهبوط المتوقع. 
تشير النتائج إلى أن عامل الأمان هو **${data.bearingCapacity.factorOfSafety.toFixed(2)}**، وهو ${data.bearingCapacity.factorOfSafety >= 3 ? 'مقبول هندسياً' : 'يتطلب مراجعة'}.

**الهبوط المتوقع:** ${data.settlement.total.toFixed(2)} مم.
`
        : `## Geotechnical Analysis Report
**Date:** ${new Date().toLocaleDateString()}
**Status:** ${riskLevel === 'High' ? 'High Risk' : 'Stable'}

Based on input soil layers, bearing capacity and settlement have been calculated.
The Factor of Safety is **${data.bearingCapacity.factorOfSafety.toFixed(2)}**, which is ${data.bearingCapacity.factorOfSafety >= 3 ? 'acceptable' : 'requires review'}.

**Total Settlement:** ${data.settlement.total.toFixed(2)} mm.
`;

    const designNotes = isAr
        ? `تم حساب التسليح بناءً على العزم الأقصى. يوصى باستخدام ${data.foundationDesign.barSuggestion}.`
        : `Reinforcement calculated based on max moment. Suggested: ${data.foundationDesign.barSuggestion}.`;

    return { doctorReport, recommendations: { solutions, riskLevel }, designNotes };
};
