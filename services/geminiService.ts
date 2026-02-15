import { GoogleGenAI } from "@google/genai";
import { SoilLayer, FoundationData, AnalysisResult, CalibrationRecord, Language, ChatMessage } from "../types";
import { runFullAnalysis, CalculationOutput } from "./calculationEngine";


// Helper to get AI instance safely
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing");
  return new GoogleGenAI({ apiKey });
};


/**
 * Main analysis function:
 * 1. Runs deterministic calculation engine for all numerical results
 * 2. Sends results to Gemini AI to generate text report + recommendations
 * 3. Merges both into a single AnalysisResult
 */
export const analyzeSoilProfile = async (
  layers: SoilLayer[],
  foundation: FoundationData,
  calibrationData: CalibrationRecord[],
  lang: Language,
  onAIComplete?: (data: { doctorReport: string; recommendations: any; designNotes: string }) => void
): Promise<AnalysisResult> => {

  // Step 1: Run deterministic calculations (Instant)
  const calcResult = runFullAnalysis(layers, foundation);

  // Step 2: Generate Fallback Report (Instant)
  const fallback = generateFallbackReport(calcResult, lang);

  // Step 3: Start AI Report in Background (Non-blocking)
  if (onAIComplete) {
    generateAIReport(calcResult, layers, foundation, lang)
      .then(aiReport => {
        onAIComplete(aiReport);
      })
      .catch(err => {
        console.warn('Background AI generation failed (using fallback):', err);
        // No need to notify UI, it already has fallback
      });
  }

  // Step 4: Return Immediate Result
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
    isAiGenerating: !!onAIComplete, // Set flag if AI is running in background
  };

  return result;
};

/**
 * Ask Gemini AI to generate ONLY the textual report, recommendations, and design notes.
 * All numerical values are already computed deterministically.
 */
async function generateAIReport(
  calcResult: CalculationOutput,
  layers: SoilLayer[],
  foundation: FoundationData,
  lang: Language
): Promise<{ doctorReport: string; recommendations: { solutions: string[]; riskLevel: string }; designNotes: string }> {
  const model = "gemini-2.5-flash";
  const ai = getAIClient();

  const langInstruction = lang === 'ar'
    ? "Write ALL text strictly in ARABIC."
    : "Write ALL text strictly in ENGLISH.";


  const prompt = `
    Role: You are an Expert Geotechnical Report Writer.

    The following analysis has been computed using standard engineering equations (Vesic, Schmertmann, Terzaghi, ACI 318, Boussinesq).

    INPUT DATA:
    Foundation: ${JSON.stringify(foundation)}
    Soil Layers: ${JSON.stringify(layers.map(l => ({ type: l.type, depth: l.depthFrom + '-' + l.depthTo + 'm', sptN: l.sptN })))}

    COMPUTED RESULTS:
    - Bearing Capacity: q_ult = ${calcResult.bearingCapacity.q_ult} kPa, q_allow = ${calcResult.bearingCapacity.q_allow} kPa, FOS = ${calcResult.bearingCapacity.factorOfSafety}
    - Settlement: Total = ${calcResult.settlement.total} mm (Elastic: ${calcResult.settlement.elastic}, Primary: ${calcResult.settlement.primary}, Secondary: ${calcResult.settlement.secondary}), Status: ${calcResult.settlement.status}
    - Time to Max Settlement: ${calcResult.settlement.timeToMaxSettlement}
    - Foundation Design: Thickness = ${calcResult.foundationDesign.minThickness} m, As = ${calcResult.foundationDesign.reinforcementArea} mm²/m, Punching: ${calcResult.foundationDesign.punchingShearCheck}
    ${calcResult.slopeStability ? `- Slope Stability: FOS = ${calcResult.slopeStability.factorOfSafety}, Status: ${calcResult.slopeStability.status}` : ''}

    TASKS:
    1. Write "doctorReport": A professional geotechnical report (markdown format) interpreting these results. Include sections: Introduction, Soil Profile, Bearing Capacity Analysis, Settlement Analysis, Structural Design, and Conclusions. Reference the computed numbers.
    2. Write "recommendations": An object with:
       - "solutions": Array of 3-5 engineering solution strings relevant to the results
       - "riskLevel": "Low", "Medium", or "High" based on the FOS and settlement values
    3. Write "designNotes": A brief paragraph explaining the structural design rationale

    ${langInstruction}

    Return ONLY valid JSON with keys: doctorReport, recommendations, designNotes.
  `;

  // Create a timeout promise (8 seconds)
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI generation timed out")), 8000)
  );

  const generationPromise = ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  // Race AI against timeout
  const response = await Promise.race([generationPromise, timeoutPromise]) as any;

  if (!response.text) {
    throw new Error("AI returned empty response");
  }

  let jsonString = response.text.trim();
  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.replace(/^```json/, '').replace(/```$/, '');
  } else if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```/, '').replace(/```$/, '');
  }

  return JSON.parse(jsonString);
}

/**
 * Fallback report when AI is unavailable
 */
function generateFallbackReport(
  calcResult: CalculationOutput,
  lang: Language
): { doctorReport: string; recommendations: { solutions: string[]; riskLevel: string }; designNotes: string } {
  const bc = calcResult.bearingCapacity;
  const st = calcResult.settlement;
  const fd = calcResult.foundationDesign;

  const riskLevel = bc.factorOfSafety < 2 ? 'High' : bc.factorOfSafety < 3 ? 'Medium' : 'Low';

  if (lang === 'ar') {
    return {
      doctorReport: `# تقرير التحليل الجيوتقني

## قدرة التحمل (طريقة Vesic)
- قدرة التحمل القصوى: **${bc.q_ult} kPa**
- قدرة التحمل المسموحة: **${bc.q_allow} kPa**
- معامل الأمان الفعلي: **${bc.factorOfSafety}**
- المعاملات: Nc=${bc.factors.Nc}, Nq=${bc.factors.Nq}, Nγ=${bc.factors.Ngamma}

## تحليل الهبوط
- الهبوط الكلي: **${st.total} ملم**
  - مرن: ${st.elastic} ملم
  - انضمام أولي: ${st.primary} ملم
  - انضمام ثانوي: ${st.secondary} ملم
- زمن الهبوط الأقصى: **${st.timeToMaxSettlement}**
- الحالة: **${st.status}**

## التصميم الإنشائي
- السمك الأدنى: **${fd.minThickness} م**
- حديد التسليح: **${fd.barSuggestion}** (${fd.reinforcementArea} ملم²/م)
- فحص القص الثاقب: **${fd.punchingShearCheck}**`,
      recommendations: {
        solutions: [
          'مراجعة معامل الأمان مع الأحمال الزلزالية',
          'إجراء اختبارات تحميل حقلية للتحقق',
          'مراقبة الهبوط أثناء وبعد الإنشاء',
          'التأكد من مستوى المياه الجوفية خلال الحفر',
        ],
        riskLevel,
      },
      designNotes: `تم تصميم الأساس وفق متطلبات كود ACI 318. السمك الأدنى ${fd.minThickness} م يحقق متطلبات القص الثاقب. حديد التسليح ${fd.barSuggestion} يتجاوز الحد الأدنى المطلوب.`,
    };
  }

  return {
    doctorReport: `# Geotechnical Analysis Report

## Bearing Capacity (Vesic's Method)
- Ultimate Bearing Capacity: **${bc.q_ult} kPa**
- Allowable Bearing Capacity: **${bc.q_allow} kPa**
- Actual Factor of Safety: **${bc.factorOfSafety}**
- Factors: Nc=${bc.factors.Nc}, Nq=${bc.factors.Nq}, Nγ=${bc.factors.Ngamma}

## Settlement Analysis
- Total Settlement: **${st.total} mm**
  - Elastic: ${st.elastic} mm
  - Primary Consolidation: ${st.primary} mm
  - Secondary Consolidation: ${st.secondary} mm
- Time to Max Settlement: **${st.timeToMaxSettlement}**
- Status: **${st.status}**

## Structural Design
- Minimum Thickness: **${fd.minThickness} m**
- Reinforcement: **${fd.barSuggestion}** (${fd.reinforcementArea} mm²/m)
- Punching Shear: **${fd.punchingShearCheck}**`,
    recommendations: {
      solutions: [
        'Review factor of safety considering seismic loading conditions',
        'Perform field plate load tests for verification',
        'Monitor settlement during and after construction',
        'Verify groundwater level during excavation',
      ],
      riskLevel,
    },
    designNotes: `Foundation designed per ACI 318 requirements. Minimum thickness of ${fd.minThickness} m satisfies punching shear requirements. Provided reinforcement ${fd.barSuggestion} exceeds minimum required area.`,
  };
}

export const askGeoExpert = async (
  history: ChatMessage[],
  currentContext: AnalysisResult,
  lang: Language
): Promise<string> => {
  try {
    const ai = getAIClient();
    const model = "gemini-2.5-flash";

    const systemInstruction = lang === 'ar'
      ? "You are a specialized geotechnical engineering assistant. Use the provided analysis results to answer user questions clearly in Arabic. Be professional and academic."
      : "You are a specialized geotechnical engineering assistant. Use the provided analysis results to answer user questions clearly in English. Be professional and academic.";


    const contextStr = JSON.stringify({
      summary: {
        settlement: currentContext.settlement,
        bearingCapacity: currentContext.bearingCapacity,
        slope: currentContext.slopeStability,
        design: currentContext.foundationDesign
      },
      soil: currentContext.layers
    });

    const prompt = `
    Context (Analysis Results): ${contextStr}

    User Chat History:
    ${history.map(h => `${h.role}: ${h.text}`).join('\n')}

    Instruction: Provide a helpful, concise answer to the last user query based on the Context.
  `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction
      }
    });

    return response.text || (lang === 'ar' ? "عذراً، لم أستطع توليد إجابة." : "Sorry, I could not generate an answer.");
  } catch (error) {
    console.error("AI Chat Error:", error);
    return lang === 'ar'
      ? "عذراً، الخدمة غير متوفرة حالياً (مفتاح API مفقود أو خطأ في الاتصال)."
      : "Sorry, service unavailable (Missing API Key or Connection Error).";
  }
};