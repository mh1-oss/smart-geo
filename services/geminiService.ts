import { GoogleGenAI, Type } from "@google/genai";
import { SoilLayer, FoundationData, AnalysisResult, CalibrationRecord, Language, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeSoilProfile = async (
  layers: SoilLayer[],
  foundation: FoundationData,
  calibrationData: CalibrationRecord[],
  lang: Language
): Promise<AnalysisResult> => {
  const model = "gemini-2.5-flash";

  const trainingContext = calibrationData.length > 0 
    ? `CALIBRATION DATA: ${JSON.stringify(calibrationData)}`
    : "";

  const langInstruction = lang === 'ar' 
    ? "Generate the 'doctorReport', 'recommendations', and 'foundationDesign.notes' strictly in ARABIC." 
    : "Generate the 'doctorReport', 'recommendations', and 'foundationDesign.notes' strictly in ENGLISH.";

  const prompt = `
    Role: You are an Expert Geotechnical & Structural Engineer using Finite Element Analysis.
    ${trainingContext}

    Input Data:
    Foundation: ${JSON.stringify(foundation)} (Target FOS=${foundation.targetFos || 3.0}).
    Layers: ${JSON.stringify(layers)}.

    Tasks:
    1. **Geotechnical Analysis:** 
       - Calculate Ultimate Bearing Capacity (q_ult) using Vesic.
       - Calculate Allowable Bearing Capacity (q_allow) = q_ult / ${foundation.targetFos || 3.0}.
       - Calculate Actual Factor of Safety = q_ult / (Applied Load / Area).
       - Calculate Settlement: Elastic + Primary + Secondary.
       - **Time Calculation:** Calculate "timeToMaxSettlement" specifically for 100% Primary Consolidation (t_100) using Tv factor. Return a specific value like "4.5 Years".
    2. **Structural Design:** 
       - Design Reinforcement (As). Check Punching Shear.
    3. **FEM Mesh Generation:**
       - Generate 'stressMesh': A grid of **60+ points** (x, z, stress in kPa) to visualize the Pressure Bulb.
       - Stress values MUST degrade from approx q_applied at z=0 to <10% at depth.
    4. **Graphs:**
       - Generate 'timeSettlement' curve points.

    Language Requirement: ${langInstruction}

    Return JSON matching the schema.
  `;

  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          timestamp: { type: Type.NUMBER }, // Current timestamp
          layers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                depth: { type: Type.STRING },
                description: { type: Type.STRING },
                params: {
                  type: Type.OBJECT,
                  properties: {
                    gamma: { type: Type.NUMBER },
                    phi: { type: Type.NUMBER },
                    c: { type: Type.NUMBER },
                    E: { type: Type.NUMBER },
                    shearStrengthAtBottom: { type: Type.NUMBER },
                    consolidation: {
                      type: Type.OBJECT,
                      properties: {
                        cc: { type: Type.NUMBER },
                        cr: { type: Type.NUMBER },
                        cv: { type: Type.NUMBER },
                        cAlpha: { type: Type.NUMBER }
                      },
                      nullable: true
                    }
                  },
                  required: ["gamma", "phi", "c", "E"]
                },
              },
              required: ["depth", "description", "params"]
            },
          },
          bearingCapacity: {
            type: Type.OBJECT,
            properties: {
              method: { type: Type.STRING },
              q_ult: { type: Type.NUMBER },
              q_allow: { type: Type.NUMBER },
              factors: {
                type: Type.OBJECT,
                properties: { Nc: { type: Type.NUMBER }, Nq: { type: Type.NUMBER }, Ngamma: { type: Type.NUMBER } },
              },
              factorOfSafety: { type: Type.NUMBER },
            },
            required: ["q_ult", "q_allow", "factors", "factorOfSafety"]
          },
          settlement: {
            type: Type.OBJECT,
            properties: {
              method: { type: Type.STRING },
              total: { type: Type.NUMBER },
              elastic: { type: Type.NUMBER },
              primary: { type: Type.NUMBER },
              secondary: { type: Type.NUMBER },
              timeToMaxSettlement: { type: Type.STRING },
              status: { type: Type.STRING },
            },
            required: ["total", "secondary", "timeToMaxSettlement"]
          },
          slopeStability: {
            type: Type.OBJECT,
            properties: {
                factorOfSafety: { type: Type.NUMBER },
                status: { type: Type.STRING },
                method: { type: Type.STRING },
                notes: { type: Type.STRING }
            },
            nullable: true
          },
          foundationDesign: {
            type: Type.OBJECT,
            properties: {
              minThickness: { type: Type.NUMBER },
              reinforcementArea: { type: Type.NUMBER },
              barSuggestion: { type: Type.STRING },
              punchingShearCheck: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["minThickness", "reinforcementArea", "barSuggestion", "punchingShearCheck"]
          },
          femAnalysis: {
            type: Type.OBJECT,
            properties: {
              maxDisplacement: { type: Type.NUMBER },
              maxVonMisesStress: { type: Type.NUMBER },
              plasticPoints: { type: Type.STRING },
              meshNodes: { type: Type.NUMBER },
              stressMesh: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER },
                    z: { type: Type.NUMBER },
                    stress: { type: Type.NUMBER }
                  }
                }
              }
            },
            required: ["maxDisplacement", "maxVonMisesStress", "stressMesh"]
          },
          recommendations: {
            type: Type.OBJECT,
            properties: {
              solutions: { type: Type.ARRAY, items: { type: Type.STRING } },
              riskLevel: { type: Type.STRING }
            },
            required: ["solutions", "riskLevel"]
          },
          graphs: {
            type: Type.OBJECT,
            properties: {
              loadSettlement: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } } },
              shearStrength: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } } },
              timeSettlement: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } } }
            },
            required: ["loadSettlement", "shearStrength", "timeSettlement"]
          },
          doctorReport: { type: Type.STRING },
        },
      },
    },
  });

  if (!response.text) {
    throw new Error("Failed to generate analysis.");
  }

  let jsonString = response.text.trim();
  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.replace(/^```json/, '').replace(/```$/, '');
  } else if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```/, '').replace(/```$/, '');
  }

  const result = JSON.parse(jsonString) as AnalysisResult;
  result.timestamp = Date.now();
  return result;
};

export const askGeoExpert = async (
  history: ChatMessage[],
  currentContext: AnalysisResult,
  lang: Language
): Promise<string> => {
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
};