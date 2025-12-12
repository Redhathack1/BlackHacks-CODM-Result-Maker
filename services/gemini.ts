import { GoogleGenAI, Type, Chat, Schema } from "@google/genai";
import { NewsItem, ScoringSystem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Image Processing ---

export interface ExtractedMatchData {
  teamName: string;
  rank: number;
  kills: number;
}

const cleanJson = (text: string): string => {
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
  if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
  return cleaned.trim();
};

export const extractMatchData = async (
  imageBase64: string, 
  mimeType: string, 
  registeredTeamNames: string[]
): Promise<ExtractedMatchData[]> => {
  try {
    const prompt = `
      Analyze this Call of Duty Mobile (CODM) or PUBG scoreboard screenshot.
      
      **TASK**: Extract a list of teams, their rank, and kill counts.
      
      **CRITICAL RANKING RULES**:
      1. **RANK 1**: The first item in the list often has a **TROPHY ICON**, a **CROWN**, or a **MEDAL** instead of a number. This is **ALWAYS Rank 1**.
      2. **RANK 2**: Look for the number "2". The row visually **ABOVE** this is Rank 1.
      3. **TEAM NAMES**: Extract the exact text (e.g., "TEAM23"). Do not add spaces if none exist.
      
      **INSTRUCTION**:
      - Start reading from the very top of the list.
      - If you see a row with a special icon (trophy/star) at the top, output Rank: 1.
      - Continue sequentially.
      
      **OUTPUT FORMAT**:
      Return a pure JSON Array. No markdown.
      Example:
      [
        { "rank": 1, "teamName": "TEAM23", "kills": 23 },
        { "rank": 2, "teamName": "TEAM8", "kills": 18 }
      ]
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              teamName: { type: Type.STRING },
              rank: { type: Type.INTEGER },
              kills: { type: Type.INTEGER }
            },
            required: ["teamName", "rank", "kills"]
          }
        }
      }
    });

    if (response.text) {
      try {
        const cleanedText = cleanJson(response.text);
        const data = JSON.parse(cleanedText) as ExtractedMatchData[];
        return data;
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON:", response.text, parseError);
        return [];
      }
    }
    return [];
  } catch (error) {
    console.error("Gemini Vision error:", error);
    return [];
  }
};

// --- Scoring System AI ---

export const parseScoringRules = async (rulesText: string): Promise<ScoringSystem | null> => {
  try {
    const prompt = `
      You are a tournament configuration assistant. 
      Convert the following natural language scoring rules into a structured JSON object.
      
      INPUT RULES:
      "${rulesText}"
      
      INTELLIGENT PARSING INSTRUCTIONS:
      1. **Progressions**: If rules say "minus 5 points till 11th place", calculate the math.
         - Example: 1st=50. 2nd=45 (-5), 3rd=40 (-5)... until the 11th place.
         - You must explicitly generate the number for every rank in the chain.
      2. **Ranges**: If rules say "11th-15th = 8 points", then indices 10, 11, 12, 13, 14 MUST all be 8.
      3. **Defaults**: 
         - "pointsPerKill": Integer (default 1 if not specified).
         - "rankPoints": An array of integers. Index 0 is Rank 1.
         - The array MUST have at least 50 entries (fill trailing with 0).
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pointsPerKill: { type: Type.INTEGER },
            rankPoints: { 
              type: Type.ARRAY,
              items: { type: Type.INTEGER }
            }
          },
          required: ["pointsPerKill", "rankPoints"]
        }
      }
    });

    if (response.text) {
      const cleaned = cleanJson(response.text);
      return JSON.parse(cleaned) as ScoringSystem;
    }
    return null;
  } catch (error) {
    console.error("Gemini Scoring Parse Error:", error);
    return null;
  }
};

// --- Existing Functions ---

export const generateMatchCommentary = async (
  gameType: string,
  winnerName: string,
  loserName: string,
  scoreWinner: number,
  scoreLoser: number,
  isDraw: boolean
): Promise<string> => {
  return "Match commentary system offline.";
};

export const suggestTournamentName = async (gameType: string): Promise<string> => {
  return "New Tournament";
};

export const getTechNews = async (): Promise<NewsItem[]> => {
  return [];
};

export const createChatSession = (): Chat => {
  return ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: "You are BlackHacks AI.",
    },
  });
};

export const sendMessageToChat = async (chat: Chat, message: string): Promise<string> => {
  return "System Offline";
};

export const explainConcept = async (topic: string): Promise<string> => {
  return "Knowledge base unavailable in lite mode.";
};