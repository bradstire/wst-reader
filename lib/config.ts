// Configuration for WST generation
export function getConfig() {
  // Get current month for date anchor
  const now = new Date();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonth = monthNames[now.getMonth()];
  
  return {
    sign: "Gemini", // default
    date_anchor: `${currentMonth} ${now.getDate()}`, // e.g., "October 16"
    output_dir: "output",
    mode: "generate",
    chapters: "all",
    seed: null,
    reversal_ratio: 0.5,
    breaks_output: "none",
    openai_model: "gpt-4.1-mini",
    temperature: 0.7
  };
}
