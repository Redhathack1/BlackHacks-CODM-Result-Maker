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
      Analyze this CODM/PUBG scoreboard image. It contains a list of teams, ranks, and kills.
      
      **CRITICAL INSTRUCTION - FINDING RANK 1**:
      1. Scan the image for the row containing the number **"2"** in the left rank column.
      2. Look **IMMEDIATELY ABOVE** that row.
      3. The row above Rank 2 is **ALWAYS Rank 1**, even if it has a Trophy icon, a Crown, or no number at all.
      4. **DO NOT SKIP THE FIRST ROW.**
      
      **DATA EXTRACTION**:
      For EVERY visible row, extract:
      - **rank**: The number on the left. If it's the trophy/medal row at the top, output \`1\`.
      - **teamName**: The text name of the team (e.g., "TEAM23", "TEAM8"). **Read this exactly.** Do not add spaces if they aren't there (e.g. "TEAM23", not "TEAM 23").
      - **kills**: The number in the Kills column.
      
      **VERIFICATION**:
      - If you output a list starting with Rank 2, **YOU ARE WRONG**.
      - You MUST find the team at Rank 1.
      
      **OUTPUT FORMAT**:
      Return a pure JSON Array:
      [
        { "rank": 1, "teamName": "TEAM23", "kills": 23 },
        { "rank": 2, "teamName": "TEAM8", "kills": 18 },
        ...
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
        console.log("AI Extracted Data:", data);
        
        // Double check validation: If we missed rank 1 but have rank 2, warn or infer?
        // For now, raw AI output with the new prompt should be sufficient.
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
      
      EXAMPLE INPUT:
      "1st place = 50 points, 2nd place = 45 points, continues with 5 points minus till 11th place. 11th-15th = 8 pts. 2 pts per kill."
      
      EXPECTED LOGIC FOR EXAMPLE:
      - Rank 1: 50
      - Rank 2: 45
      - Rank 3: 40
      - ...
      - Rank 10: 5
      - Rank 11-15: 8
      - Points per kill: 2
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
  try {
    let prompt = "";
    if (isDraw) {
      prompt = `Write a short, intense 1-sentence commentary for a ${gameType} match that ended in a draw (${scoreWinner}-${scoreLoser}) between ${winnerName} and ${loserName}. Make it sound like an esports shoutcaster.`;
    } else {
      prompt = `Write a short, intense 1-sentence commentary for a ${gameType} match where ${winnerName} defeated ${loserName} with a score of ${scoreWinner}-${scoreLoser}. Hype up the winner. Make it sound like an esports shoutcaster.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "What a match!";
  } catch (error) {
    console.error("Gemini error:", error);
    return "The crowd goes wild!";
  }
};

export const suggestTournamentName = async (gameType: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a cool, short, 3-word name for a ${gameType} tournament. Return ONLY the name.`,
    });
    return response.text.replace(/"/g, '') || `${gameType} Championship`;
  } catch (error) {
    return "Ultimate League";
  }
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