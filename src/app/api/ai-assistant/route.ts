import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { title, description, reason } = await req.json();

    const contextualDescription = description && description.trim() !== '' ? description : 'No description provided';

    const prompt = `
You are the AI Operations Assistant for Syazna World, a premier HR Outsourcing Agency in Malaysia. You are bilingual and can process inputs in both English and Bahasa Melayu (including colloquial/informal Malay).

### **LANGUAGE LOGIC:**
- **Bilingual Processing:** If the input is in Malay, provide suggestions in Professional Malay or a mix of Malay and English HR jargon (Manglish/Professional HR style).
- **Jargon Preservation:** Always maintain technical terms in English where appropriate (e.g., "Payroll", "Onboarding", "Statutory Contributions", "Compliance").

### **YOUR TASKS:**

#### **1. Title Professionalization (Multi-Language)**
- Detect junk or overly simple titles in either language (e.g., "gaji", "surat", "test", "asdf", "BUat gaji bln").
- Suggest a formal, descriptive title based on the description. If the title is already professional, you can return the same title or improve it slightly.
- *Example (Malay Input):* "gaji axicom" -> "Processing Monthly Payroll - AXICOM SDN BHD".
- *Example (Malay Input):* "surat amaran" -> "Issuance of Show Cause Letter - [Employee Name]".

#### **2. Actionable Checklist Extraction**
- Extract 3 to 5 logical sub-tasks from the description.
- Use common Malaysian HR terminology (e.g., "Caruman KWSP", "Potongan PCB", "Borang E").
- *Example:* For "Setup pekerja baru", include: "Daftar portal KWSP/SOCSO", "Sediakan kontrak perkhidmatan", "Input data ke dalam sistem payroll".

#### **3. Smart Escalation Handover**
- Convert brief or informal escalation notes into professional technical summaries.
- *Example (Malay Input):* "tak lepas pcb" -> "Manual verification required for PCB calculation due to system error. Please cross-check with latest LHDN table.".

### **CONTEXT PROVIDED SO FAR:**
- Task Title: "${title || 'Untitled'}"
- Task Description: "${contextualDescription}"
${reason ? `- Escalation Draft/Note: "${reason}"` : ''}

### **OUTPUT FORMAT (Strict JSON only, no markdown):**
{
  "suggested_title": "string or null",
  "checklist_items": ["string", "string", "string"],
  "escalation_summary": "string or null"
}
`;

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      }
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('Gemini AI Action Extractor API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
