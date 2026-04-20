import { GoogleGenAI, Type } from "@google/genai";

// Initialize the Gemini API client
// Note: process.env.GEMINI_API_KEY is handled by the platform.
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '' 
});

const MODEL_NAME = "gemini-3-flash-preview";

export interface StorySuggestion {
  title: string;
  content: string;
  outline: string[];
}

/**
 * Suggests a story based on a title and category.
 */
export async function suggestStoryContent(title: string, category: string): Promise<StorySuggestion | null> {
  try {
    const prompt = `Help me write a story. 
    Title: ${title}
    Category: ${category}
    
    Please provide:
    1. A better, catchy title (if needed).
    2. A brief 1-paragraph starting content.
    3. A 3-point outline for the rest of the story.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            outline: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            }
          },
          required: ["title", "content", "outline"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text.trim());
    }
    return null;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
}

/**
 * Enhances existing story content.
 */
export async function refineStoryContent(content: string): Promise<string | null> {
  try {
    const prompt = `Refine and improve the following story content. 
    Make it more engaging and fix any grammatical errors. 
    Keep the original tone but enhance the descriptions.
    
    Content: ${content}`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: "You are a professional editor and creative writer."
      }
    });

    return response.text || null;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
}
