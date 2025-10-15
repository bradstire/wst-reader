// pages/index.js
import React, { useEffect, useRef, useState } from "react";

export default function Home() {
  const [reading, setReading] = useState("");
  const [sign, setSign] = useState("Gemini");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [output, setOutput] = useState("");
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [ellipsis, setEllipsis] = useState(".");
  const hasInitialMessageBeenReplaced = useRef(false);
  const [currentCard, setCurrentCard] = useState(null);
  const [currentCardOverlayOpacity, setCurrentCardOverlayOpacity] = useState(0);
  const [isCurrentCardReversed, setIsCurrentCardReversed] = useState(false);
  const lastProcessedOutput = useRef('');
  const scrollDetectionActive = useRef(false);

  // Animate ellipsis during generation
  useEffect(() => {
    if (!isGenerating || hasInitialMessageBeenReplaced.current) return;
    
    const interval = setInterval(() => {
      setEllipsis(prev => {
        const next = prev === '.' ? '..' : prev === '..' ? '...' : '.';
        // Only update output if it's still empty or just ellipsis
        if (!output || output === '.' || output === '..' || output === '...') {
          setOutput(next);
        }
        return next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isGenerating, output, hasInitialMessageBeenReplaced]);

  // Stop ellipsis animation when content arrives
  useEffect(() => {
    if (output && output !== '.' && output !== '..' && output !== '...' && output.length > 3) {
      setEllipsis('.'); // Reset ellipsis state
      // Clear any remaining ellipsis from output
      if (output.startsWith('.') || output.startsWith('..') || output.startsWith('...')) {
        setOutput(output.replace(/^\.+/, ''));
      }
    }
  }, [output]);

  // Force ellipsis cleanup when generation finishes
  useEffect(() => {
    if (isFinished && ellipsis !== '.') {
      setEllipsis('.');
      setOutput(prev => prev.replace(/^\.+/, ''));
    }
  }, [isFinished, ellipsis]);

  // Timeout fallback - if generation takes too long without content, show error
  useEffect(() => {
    if (!isGenerating) return;
    
    const timeout = setTimeout(() => {
      if (!hasInitialMessageBeenReplaced.current && (output === '.' || output === '..' || output === '...')) {
        console.log('[timeout] Generation took too long, showing error');
        setOutput('Generation failed: Please check your OpenAI API quota and try again.');
        setEllipsis('.');
        hasInitialMessageBeenReplaced.current = true;
        setIsGenerating(false);
        setIsFinished(true);
        setShowProgress(false);
      }
    }, 20000); // 20 second timeout

    return () => clearTimeout(timeout);
  }, [isGenerating, output, hasInitialMessageBeenReplaced]);

  // Emulate progress movement during generation
  useEffect(() => {
    if (!isGenerating) return;
    
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        // Stop at 95% to leave room for actual progress updates
        if (prev >= 95) return prev;
        // Increase by 1-2% every 2-3 seconds
        return prev + Math.floor(Math.random() * 2) + 1;
      });
    }, 2000 + Math.random() * 1000); // Random interval between 2-3 seconds

    return () => clearInterval(progressInterval);
  }, [isGenerating]);

  // Scroll-based card detection (starts after first card appears)
  useEffect(() => {
    const outputDiv = document.getElementById('output');
    if (!outputDiv || !currentCard) return; // Only start after first card appears

    // Activate scroll detection
    scrollDetectionActive.current = true;

    const handleScroll = () => {
      detectCardInView();
    };

    outputDiv.addEventListener('scroll', handleScroll);
    return () => outputDiv.removeEventListener('scroll', handleScroll);
  }, [output, currentCard]);

  // Dynamic scrollbar based on visible content only
  useEffect(() => {
    if (!output) return;

    const checkScrollbar = () => {
      const outputDiv = document.getElementById('output');
      if (!outputDiv) return;

      // Get all visible paragraphs (those with opacity 1)
      const paragraphs = outputDiv.querySelectorAll('.animate-fade-in');
      let lastVisibleIndex = -1;
      
      paragraphs.forEach((paragraph, index) => {
        const computedStyle = window.getComputedStyle(paragraph);
        const isVisible = computedStyle.opacity === '1' || computedStyle.opacity === '1.0';
        if (isVisible) {
          lastVisibleIndex = index;
        }
      });

      if (lastVisibleIndex >= 0) {
        // Calculate the height up to the last visible paragraph
        const visibleParagraphs = Array.from(paragraphs).slice(0, lastVisibleIndex + 1);
        let totalHeight = 0;
        
        visibleParagraphs.forEach(paragraph => {
          totalHeight += paragraph.offsetHeight;
        });
        
        // Add padding
        totalHeight += 80; // 40px padding top and bottom
        
        const containerHeight = outputDiv.clientHeight;
        
        // Enable scrolling as soon as content approaches the edge of viewport
        // Add a small buffer (50px) to trigger scrollbar slightly before hitting edge
        if (totalHeight > (containerHeight - 50)) {
          outputDiv.style.overflow = 'auto';
          outputDiv.style.height = '80vh';
        } else {
          // Visible content fits in viewport - no scrollbar needed
          outputDiv.style.overflow = 'hidden';
          outputDiv.style.height = '80vh';
        }
      } else {
        // No visible content yet - no scrolling
        outputDiv.style.overflow = 'hidden';
      }
    };

    // Check immediately
    checkScrollbar();

    // Check every 100ms for faster response
    const interval = setInterval(checkScrollbar, 100);
    
    return () => clearInterval(interval);
  }, [output]);

  // Card detection is now handled by the text-based system below

  // Detect cards based on text content only - runs only when output changes
  // This only handles the initial card 1 appearance, then scroll detection takes over
  useEffect(() => {
    if (!output) {
      setCurrentCard(null);
      setCurrentCardOverlayOpacity(0);
      lastProcessedOutput.current = '';
      scrollDetectionActive.current = false;
      return;
    }

    // Skip if we've already processed this exact output
    if (lastProcessedOutput.current === output) {
      return;
    }

    // Skip if scroll detection is already active
    if (scrollDetectionActive.current) {
      return;
    }

    // Parse the raw output text
    const paragraphs = output.split('\n\n');
    let bestCard = null;
    let bestCardReversed = false;
    let bestCardIndex = -1;
    
    // Only process if we have at least 2 paragraphs (for card 1 timing)
    if (paragraphs.length < 2) {
      setCurrentCard(null);
      setCurrentCardOverlayOpacity(0);
      lastProcessedOutput.current = output;
      return;
    }
    
    // Find cards, but only show card 1 when paragraph 2 appears (index 1)
    paragraphs.forEach((paragraph, index) => {
      const cardMatch = paragraph.match(/([A-Za-z\s]+(?:of\s+[A-Za-z\s]+)?)(?:\s*,\s*reversed)?/i);
      
      if (cardMatch) {
        const cardName = cardMatch[1].trim();
        const cardImage = getCardImage(cardName);
        const isReversed = /reversed/i.test(paragraph);
        
        if (cardImage) {
          // For card 1 (first card), only show when paragraph 2 appears (index 1)
          if (index === 1 && bestCardIndex === -1) {
            bestCard = cardImage;
            bestCardReversed = isReversed;
            bestCardIndex = index;
          }
        }
      }
    });
    
    // Set the best card (most recent/deepest) with slight delay for paragraph 2 timing
    if (bestCard) {
      // Add delay to sync with paragraph 2 animation (0.75s + 2.5s = 3.25s total)
      setTimeout(() => {
        setCurrentCard(bestCard);
        setIsCurrentCardReversed(bestCardReversed);
        setCurrentCardOverlayOpacity(0.25); // Max opacity
      }, 3200); // 3.2s delay to appear just as paragraph 2 fades in
    } else {
      // Clear card if none found
      setCurrentCard(null);
      setCurrentCardOverlayOpacity(0);
    }

    // Mark this output as processed
    lastProcessedOutput.current = output;
  }, [output]);


  // Card name to filename mapping
  const getCardImage = (cardName) => {
    if (!cardName) return null;
    
    const normalized = cardName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/,?\s*reversed\.?/g, '');
    
    // Major Arcana mappings
    const majorArcana = {
      'the_fool': '_0072_major_arcana_fool.png',
      'the_magician': '_0064_major_arcana_magician.png',
      'the_high_priestess': '_0062_major_arcana_priestess.png',
      'the_empress': '_0073_major_arcana_empress.png',
      'the_emperor': '_0074_major_arcana_emperor.png',
      'the_hierophant': '_0068_major_arcana_hierophant.png',
      'the_lovers': '_0065_major_arcana_lovers.png',
      'the_chariot': '_0077_major_arcana_chariot.png',
      'strength': '_0060_major_arcana_strength.png',
      'the_hermit': '_0069_major_arcana_hermit.png',
      'wheel_of_fortune': '_0071_major_arcana_fortune.png',
      'justice': '_0066_major_arcana_justice.png',
      'the_hanged_man': '_0070_major_arcana_hanged.png',
      'death': '_0076_major_arcana_death.png',
      'temperance': '_0058_major_arcana_temperance.png',
      'the_devil': '_0075_major_arcana_devil.png',
      'the_tower': '_0057_major_arcana_tower.png',
      'the_star': '_0061_major_arcana_star.png',
      'the_moon': '_0063_major_arcana_moon.png',
      'the_sun': '_0059_major_arcana_sun.png',
      'judgement': '_0067_major_arcana_judgement.png',
      'the_world': '_0056_major_arcana_world.png'
    };
    
    // Minor Arcana mappings
    const minorArcana = {
      'ace_of_wands': '_0004_minor_arcana_wands_ace.png',
      'two_of_wands': '_0013_minor_arcana_wands_2.png',
      'three_of_wands': '_0012_minor_arcana_wands_3.png',
      'four_of_wands': '_0011_minor_arcana_wands_4.png',
      'five_of_wands': '_0010_minor_arcana_wands_5.png',
      'six_of_wands': '_0009_minor_arcana_wands_6.png',
      'seven_of_wands': '_0008_minor_arcana_wands_7.png',
      'eight_of_wands': '_0007_minor_arcana_wands_8.png',
      'nine_of_wands': '_0006_minor_arcana_wands_9.png',
      'ten_of_wands': '_0005_minor_arcana_wands_10.png',
      'page_of_wands': '_0001_minor_arcana_wands_page.png',
      'knight_of_wands': '_0002_minor_arcana_wands_knight.png',
      'queen_of_wands': '_0000_minor_arcana_wands_queen.png',
      'king_of_wands': '_0003_minor_arcana_wands_king.png',
      'ace_of_cups': '_0046_minor_arcana_cups_ace.png',
      'two_of_cups': '_0055_minor_arcana_cups_2.png',
      'three_of_cups': '_0054_minor_arcana_cups_3.png',
      'four_of_cups': '_0053_minor_arcana_cups_4.png',
      'five_of_cups': '_0052_minor_arcana_cups_5.png',
      'six_of_cups': '_0051_minor_arcana_cups_6.png',
      'seven_of_cups': '_0050_minor_arcana_cups_7.png',
      'eight_of_cups': '_0049_minor_arcana_cups_8.png',
      'nine_of_cups': '_0048_minor_arcana_cups_9.png',
      'ten_of_cups': '_0047_minor_arcana_cups_10.png',
      'page_of_cups': '_0043_minor_arcana_cups_page.png',
      'knight_of_cups': '_0044_minor_arcana_cups_knight.png',
      'queen_of_cups': '_0042_minor_arcana_cups_queen.png',
      'king_of_cups': '_0045_minor_arcana_cups_king.png',
      'ace_of_swords': '_0018_minor_arcana_swords_ace.png',
      'two_of_swords': '_0027_minor_arcana_swords_2.png',
      'three_of_swords': '_0026_minor_arcana_swords_3.png',
      'four_of_swords': '_0025_minor_arcana_swords_4.png',
      'five_of_swords': '_0024_minor_arcana_swords_5.png',
      'six_of_swords': '_0023_minor_arcana_swords_6.png',
      'seven_of_swords': '_0022_minor_arcana_swords_7.png',
      'eight_of_swords': '_0021_minor_arcana_swords_8.png',
      'nine_of_swords': '_0020_minor_arcana_swords_9.png',
      'ten_of_swords': '_0019_minor_arcana_swords_10.png',
      'page_of_swords': '_0015_minor_arcana_swords_page.png',
      'knight_of_swords': '_0016_minor_arcana_swords_knight.png',
      'queen_of_swords': '_0014_minor_arcana_swords_queen.png',
      'king_of_swords': '_0017_minor_arcana_swords_king.png',
      'ace_of_pentacles': '_0032_minor_arcana_pentacles_ace.png',
      'two_of_pentacles': '_0041_minor_arcana_pentacles_2.png',
      'three_of_pentacles': '_0040_minor_arcana_pentacles_3.png',
      'four_of_pentacles': '_0039_minor_arcana_pentacles_4.png',
      'five_of_pentacles': '_0038_minor_arcana_pentacles_5.png',
      'six_of_pentacles': '_0037_minor_arcana_pentacles_6.png',
      'seven_of_pentacles': '_0036_minor_arcana_pentacles_7.png',
      'eight_of_pentacles': '_0035_minor_arcana_pentacles_8.png',
      'nine_of_pentacles': '_0034_minor_arcana_pentacles_9.png',
      'ten_of_pentacles': '_0033_minor_arcana_pentacles_10.png',
      'page_of_pentacles': '_0029_minor_arcana_pentacles_page.png',
      'knight_of_pentacles': '_0030_minor_arcana_pentacles_knight.png',
      'queen_of_pentacles': '_0028_minor_arcana_pentacles_queen.png',
      'king_of_pentacles': '_0031_minor_arcana_pentacles_king.png'
    };
    
    return majorArcana[normalized] || minorArcana[normalized] || null;
  };

  // Detect card names in visible text and update background with opacity
  const detectCardInView = () => {
    if (!output) {
      setCurrentCard(null);
      setCurrentCardOverlayOpacity(0);
      return;
    }
    
    const textbox = document.getElementById('output');
    if (!textbox) return;
    
    const scrollTop = textbox.scrollTop;
    const textboxHeight = textbox.clientHeight;
    const textboxCenter = scrollTop + textboxHeight / 2;
    const fadeZone = textboxHeight * 0.7; // 70% of textbox height for the fade zone
    
    // Find the paragraph closest to center
    const paragraphs = textbox.querySelectorAll('.animate-fade-in');
    let closestCard = null;
    let closestDistance = Infinity;
    let isReversed = false;
    
    paragraphs.forEach((paragraph, index) => {
      const text = paragraph.textContent;
      const cardPatterns = [
        /(?:The\s+)?(?:Fool|Magician|High\s+Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel\s+of\s+Fortune|Justice|Hanged\s+Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World)/gi,
        /(?:Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King)\s+of\s+(?:Wands|Cups|Swords|Pentacles)/gi
      ];
      
      for (const pattern of cardPatterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
          const cardName = matches[0];
          const imageFile = getCardImage(cardName);
          if (imageFile) {
            // Check if this card is reversed
            const cardIsReversed = /reversed/i.test(text);
            
            const paragraphTop = paragraph.offsetTop;
            const paragraphCenter = paragraphTop + paragraph.offsetHeight / 2;
            const distance = Math.abs(paragraphCenter - textboxCenter);
            
            // Only consider cards within the fade zone AND that have finished their fade-in animation
            const computedStyle = window.getComputedStyle(paragraph);
            const isVisible = computedStyle.opacity === '1' || computedStyle.opacity === '1.0';
            const isInFadeZone = distance < fadeZone;
            
            if (isInFadeZone && isVisible && distance < closestDistance) {
              closestCard = imageFile;
              closestDistance = distance;
              isReversed = cardIsReversed;
            }
          }
        }
      }
    });
    
    if (closestCard && closestDistance < fadeZone) {
      setCurrentCard(closestCard);
      setIsCurrentCardReversed(isReversed);
      const normalizedDistance = Math.min(closestDistance / fadeZone, 1);
      // Card opacity: 0.25 (25%) at center, 0 at edges
      const cardOpacity = 0.25 * (1 - normalizedDistance);
      setCurrentCardOverlayOpacity(cardOpacity);
    } else {
      setCurrentCard(null);
      setIsCurrentCardReversed(false);
      setCurrentCardOverlayOpacity(0);
    }
  };

  // ----- API helpers -----
async function handleGenerate() {
    setIsFinished(false);
    setOutput('');
    setIsGenerating(true);
    setProgress(0);
    setShowProgress(true);
    setEllipsis('.');
    hasInitialMessageBeenReplaced.current = false;
    
    // Clear any existing card to prevent flicker
    setCurrentCard(null);
    setCurrentCardOverlayOpacity(0);
    setIsCurrentCardReversed(false);
    lastProcessedOutput.current = '';
    scrollDetectionActive.current = false;

  try {
    // First, trigger generation
    console.log('[generate] Starting generation...');
    const generateResp = await fetch(`/api/generate?sign=${encodeURIComponent(sign)}`, { 
      method: 'POST' 
    });
    
    if (!generateResp.ok) {
      const errorData = await generateResp.json();
      throw new Error(errorData.error || 'Generation failed');
    }
    
    const generateData = await generateResp.json();
    console.log('[generate] Generation complete:', generateData);
    
    // Then stream the result
    await startStreaming(sign, setOutput);
  } catch (e) {
    console.error('[generate] Error:', e);
    setOutput(prev => prev + String(e));
  } finally {
    setIsGenerating(false);
    
    // Wait for content to be fully visible before showing download buttons
    // Use a longer delay to ensure all content has been streamed and animated
    setTimeout(() => {
      setIsFinished(true);
      setShowProgress(false); // Hide progress bar when fully complete
    }, 15000); // 15 seconds should be enough for most readings
  }
}


async function startStreaming(sign, setOutput) {
  try {
    const url = `/api/reading-stream?sign=${encodeURIComponent(sign)}`;
    const resp = await fetch(url, {
      method: "GET",
    });

    if (!resp.ok || !resp.body) {
      const fallback = await resp.text();
      setOutput(fallback);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let lastFlushTime = 0;
    const FLUSH_INTERVAL = 40; // 40ms between flushes
    const MIN_CHUNK_SIZE = 500; // minimum characters before flushing

    function appendChunk(delta) {
      // append synchronously
      setOutput(prev => prev + delta);

      // force a paint between bursts
      // (1) yield to event loop
      setTimeout(() => {
        // (2) then nudge layout/paint
        requestAnimationFrame(() => {
          // no-op: the RAF tick ensures the browser repaints
        });
      }, 0);
    }

    function flushBuffer() {
      if (buffer.length > 0) {
        appendChunk(buffer);
        buffer = "";
        lastFlushTime = Date.now();
      }
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        flushBuffer(); // flush any remaining content
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Parse SSE format and extract data
      const lines = buffer.split('\n');
      buffer = lines.pop() || ""; // keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const content = line.slice(6); // remove 'data: ' prefix
          console.log('[SSE]', content.substring(0, 100));
          if (content.trim()) {
            // Handle special message types
            if (content.startsWith('[progress] ')) {
              const progressValue = parseInt(content.slice(11));
              console.log('[progress]', progressValue);
              // Only update progress if it's higher than current (real progress overrides emulated)
              // But cap it at 95% until we're actually done
              setProgress(prev => Math.min(Math.max(prev, progressValue), 95));
              // Don't hide progress bar here - let it be controlled by isFinished state
            } else if (content.startsWith('[meta] ')) {
              // Skip meta messages, they're just for debugging
              continue;
            } else if (content.startsWith('[warn] ')) {
              const message = content.slice(7);
              console.log('[warn]', message);
              // Check if it's a quota exceeded error
              if (message.includes('quota') || message.includes('429') || message.includes('insufficient_quota')) {
                console.log('[quota error detected]', message);
                setOutput('Generation failed: OpenAI API quota exceeded. Please check your billing and try again later.');
                setEllipsis('.');
                hasInitialMessageBeenReplaced.current = true;
                setIsGenerating(false);
                setIsFinished(true);
                setShowProgress(false);
                return;
              }
              appendChunk(`[Warning] ${message}\n`);
            } else if (content.startsWith('[error] ')) {
              const message = content.slice(8);
              console.log('[error]', message);
              appendChunk(`[Error] ${message}\n`);
            } else {
              // Handle regular JSON delta messages
              try {
                const parsed = JSON.parse(content);
                if (parsed.delta) {
                  console.log('[delta]', parsed.delta.substring(0, 100) + '...');
                  // If this is the first real content and we still have ellipsis
                  if (!hasInitialMessageBeenReplaced.current && parsed.delta.trim()) {
                    console.log('[first content]', parsed.delta.substring(0, 100));
                    setOutput(parsed.delta); // Replace any ellipsis with first content
                    hasInitialMessageBeenReplaced.current = true;
                    setEllipsis('.'); // Stop ellipsis animation
                    // Hide progress and enable downloads as soon as first paragraph shows
                    setTimeout(() => {
                      setShowProgress(false);
                      setIsFinished(true);
                    }, 800);
                  } else if (hasInitialMessageBeenReplaced.current) {
                    // Normal content appending after initial replacement
                    appendChunk(parsed.delta);
                  }
                }
              } catch {
                // fallback to plain text if JSON parsing fails
                appendChunk(content);
              }
            }
          }
        }
      }

      // Throttle flushing: flush every 40ms or when buffer gets large
      const now = Date.now();
      if (now - lastFlushTime >= FLUSH_INTERVAL || buffer.length >= MIN_CHUNK_SIZE) {
        flushBuffer();
      }
    }
  } catch (e) {
    setOutput(String(e));
  }
}

  function downloadScript() {
    window.location.href = `/api/download?kind=plain&sign=${encodeURIComponent(sign)}`;
  }

  function downloadScriptWithBreaks() {
    window.location.href = `/api/download?kind=breaks&sign=${encodeURIComponent(sign)}`;
  }

  return (
    <main className="min-h-screen w-full" style={{
      background: 'radial-gradient(ellipse at top left, #2D1B69 0%, #1A1625 25%, #1A1625 50%, #3D2A5F 75%, #2A1A4A 100%)'
    }}>
      <div className="w-full max-w-4xl mx-auto px-4 pt-6">
        <h1 className="font-bold mb-4 text-center" style={{
          textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
          color: '#ffffff',
          letterSpacing: '0.0375em',
          fontSize: '2.5rem'
        }}>WHITE SOUL TAROT</h1>

                  <div className="flex flex-wrap items-center justify-center" style={{gap: '24px', marginBottom: '40px'}}>
                    {/* Generate */}
            <button
              className="px-6 py-3 rounded-lg text-white disabled:opacity-60 font-bold text-lg"
              style={{ 
                fontSize: '20px', 
                fontWeight: 'bold', 
                padding: '12px 24px',
                borderRadius: '8px',
                background: 'rgba(34, 32, 58, 0.4)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating…' : 'Generate'}
            </button>

          {/* Sign */}
          <select
            className="py-3 rounded-lg text-white font-bold text-lg text-center"
            style={{ 
              fontSize: '20px', 
              fontWeight: 'bold', 
              padding: '12px 30px 12px 20px',
              borderRadius: '8px',
              textAlign: 'center',
              background: 'rgba(34, 32, 58, 0.4)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              width: 'fit-content',
              minWidth: `${sign.length * 12 + 65}px`,
              color: '#ffffff',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 18px center',
              backgroundSize: '16px'
            }}
            value={sign}
            onChange={(e) => setSign(e.target.value)}
          >
            <option value="Aries">Aries</option>
            <option value="Taurus">Taurus</option>
            <option value="Gemini">Gemini</option>
            <option value="Cancer">Cancer</option>
            <option value="Leo">Leo</option>
            <option value="Virgo">Virgo</option>
            <option value="Libra">Libra</option>
            <option value="Scorpio">Scorpio</option>
            <option value="Sagittarius">Sagittarius</option>
            <option value="Capricorn">Capricorn</option>
            <option value="Aquarius">Aquarius</option>
            <option value="Pisces">Pisces</option>
          </select>

          {isFinished && output && (
            <>
            <button
                        className="px-5 py-3 rounded-lg text-white font-bold text-lg" 
                        style={{ 
                          fontSize: '20px', 
                          fontWeight: 'bold', 
                          padding: '12px 20px',
                          borderRadius: '8px',
                          background: 'rgba(34, 32, 58, 0.4)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                        onClick={downloadScript}
                      >
                        Download .txt
            </button>
            <button
                        className="px-5 py-3 rounded-lg text-white font-bold text-lg" 
                        style={{ 
                          fontSize: '20px', 
                          fontWeight: 'bold', 
                          padding: '12px 20px',
                          borderRadius: '8px',
                          background: 'rgba(34, 32, 58, 0.4)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                        onClick={downloadScriptWithBreaks}
                      >
                        Download .txt (with studio breaks)
            </button>
            </>
          )}
        </div>

                  {/* Card overlay - fixed to center of viewport */}
                  {currentCard && (
                    <div
                      style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        width: '325px',
                        height: '455px',
                        marginTop: '-227.5px',
                        marginLeft: '-162.5px',
                        backgroundImage: `url('/cards/${currentCard}')`,
                        backgroundSize: 'contain',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        opacity: currentCardOverlayOpacity,
                        pointerEvents: 'none',
                        zIndex: 1,
                        transform: isCurrentCardReversed ? 'rotate(180deg)' : 'none'
                      }}
                    />
                  )}

        {/* Progress bar */}
        {showProgress && (
          <div className="w-full max-w-[1500px] mx-auto" style={{ marginTop: '0px', marginBottom: '20px' }}>
            <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-center mt-2 text-sm text-gray-300">
              Generating tarot reading... {progress}%
            </div>
          </div>
        )}

        {/* Output box */}
        <div className="w-full">
          {/* width limiter for the text box */}
          <div className="w-full mx-auto max-w-[1500px]"> {/* ← widened from 900px to 1500px (600px wider) */}
            <div
              id="output"
              className="
                h-[80vh] w-full
                whitespace-pre-wrap
                rounded-lg border border-white/20
                text-[#E6E6EB]
                font-mono text-[24px] leading-8 shadow-2xl
                backdrop-blur-md
              "
              style={{
                padding: '40px', 
                borderRadius: '8px',
                backgroundColor: 'rgba(34, 32, 58, 0.3)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Text content with fixed opacity */}
              <div style={{ position: 'relative', zIndex: 2 }}>
                {output && output.split('\n\n').map((paragraph, index) => (
                  <div
                    key={index}
                    className="opacity-0 animate-fade-in"
                    style={{
                      animationDelay: `${0.75 + (index * 2.5)}s`,
                      animationFillMode: 'forwards',
                      marginBottom: '32px',
                      color: '#E6E6EB',
                      lineHeight: '1.6',
                      // Hide content until it's supposed to appear
                      maxHeight: '0px',
                      overflow: 'hidden',
                      transition: 'max-height 0.01s ease-out'
                    }}
                    ref={(el) => {
                      if (el) {
                        // Show content when it's supposed to appear
                        const showTime = 0.75 + (index * 2.5) * 1000;
                        setTimeout(() => {
                          if (el) {
                            el.style.maxHeight = 'none';
                            el.style.overflow = 'visible';
                          }
                        }, showTime);
                      }
                    }}
                  >
                    {paragraph}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

