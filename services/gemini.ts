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
      Analyze this game scoreboard screenshot (likely CODM, PUBG, or similar Battle Royale).
      
      **GOAL**: Extract the Leaderboard rows accurately.
      
      **COLUMN GUIDANCE**:
      1. **RANK/PLACEMENT**: Usually the leftmost number (1, 2, 3...) or an icon with a number.
      2. **TEAM/PLAYER NAME**: The text identifier for the participant (e.g., "TEAM17", "SKT T1", "User123").
      3. **KILLS**: A number, often near a crosshair icon or labeled 'Kills'.
      
      **CRITICAL EXTRACTION RULES**:
      - **DO NOT** confuse the Rank number with the Team Name.
      - If the Team Name column says "TEAM17", return "TEAM17". (Do NOT return '1' just because it is in 1st place).
      - If the Team Name column says "TEAM1", return "TEAM1".
      - If the Team Name is just a number (e.g. "17"), return "17".
      - Extract the text **EXACTLY** as shown in the name column.
      
      **OUTPUT FORMAT**:
      Return a JSON Array of objects with these properties:
      - \`teamName\`: The extracted text string from the name column.
      - \`rank\`: The integer from the rank/placement column.
      - \`kills\`: The integer from the kills column (default 0 if missing).
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
        console.log("Extracted Data:", data);
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