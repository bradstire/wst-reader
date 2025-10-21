// Configuration for WST generation
export function getConfig() {
  // Get current month for date anchor
  const now = new Date();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonth = monthNames[now.getMonth()];
  
  // Add ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
  const day = now.getDate();
  let suffix = 'th';
  if (day === 1 || day === 21 || day === 31) suffix = 'st';
  else if (day === 2 || day === 22) suffix = 'nd';
  else if (day === 3 || day === 23) suffix = 'rd';
  
  return {
    sign: "Gemini", // default
    date_anchor: `${currentMonth} ${day}${suffix}`, // e.g., "October 21st"
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
