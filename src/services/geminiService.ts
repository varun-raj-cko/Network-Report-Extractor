/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function explainClearingRecord(record: Record<string, any>, schemaName: string) {
  const prompt = `
    You are an expert in financial clearing and settlement systems (Mastercard IPM and Visa Base II).
    Please explain the following clearing record in plain English for a business analyst.
    
    Report Type: ${schemaName}
    Record Data:
    ${JSON.stringify(record, null, 2)}
    
    Focus on:
    1. What kind of transaction is this? (Sale, Refund, Fee, etc.)
    2. What are the key amounts involved?
    3. What do the cryptic codes (MTI, Function Code, IRD, etc.) imply about the transaction's status or reconciliation?
    4. Are there any potential issues or interesting details in this specific record?
    
    Keep the explanation professional, concise, and structured.
  `;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("GEMINI_API_KEY")) {
      return "The AI Expert is not configured. Please add GEMINI_API_KEY to your environment/secrets.";
    }
    return "Sorry, I couldn't analyze this record at the moment.";
  }
}
