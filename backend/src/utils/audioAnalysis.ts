import * as fs from 'fs';

interface AudioFeatures {
  volume: number;
  pitchVariance: number;
  energy: number;
  consistency: number;
  averagePitch: number;
  pitchRange: number;
}

export function extractAudioFeatures(wavFilePath: string): AudioFeatures {
  try {
    // Read WAV file as raw buffer
    const wavBuffer = fs.readFileSync(wavFilePath);
    
    // Parse WAV header manually
    const sampleRate = wavBuffer.readUInt32LE(24);
    const bitsPerSample = wavBuffer.readUInt16LE(34);
    const numChannels = wavBuffer.readUInt16LE(22);
    const dataSize = wavBuffer.readUInt32LE(40);
    const dataStart = 44; // Standard WAV header size
    
    console.log(`WAV Info: ${sampleRate}Hz, ${bitsPerSample}bit, ${numChannels}ch, ${dataSize} bytes`);
    
    // Convert to float samples
    const samples: number[] = [];
    const bytesPerSample = bitsPerSample / 8;
    
    // Fix: Properly handle mono audio by incrementing by bytesPerSample * numChannels
    for (let i = dataStart; i < dataStart + dataSize; i += bytesPerSample * numChannels) {
      let sample: number;
      
      if (bitsPerSample === 16) {
        sample = wavBuffer.readInt16LE(i) / 32768.0; // Convert to -1 to 1 range
      } else if (bitsPerSample === 32) {
        sample = wavBuffer.readFloatLE(i);
      } else {
        // Skip unsupported bit depths
        continue;
      }
      
      // For mono audio, we can directly add the sample
      // For stereo, we would only take the first channel (left)
      samples.push(sample);
    }
    
    console.log(`Extracted ${samples.length} samples`);
    
    if (samples.length === 0) {
      throw new Error('No valid samples found');
    }
    
    const floatSamples = new Float32Array(samples);
    
    // Calculate volume (RMS)
    const volume = calculateRMS(floatSamples);
    
    // Extract pitch using autocorrelation
    const pitches = extractPitches(floatSamples, sampleRate);
    const averagePitch = pitches.length > 0 ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0;
    const pitchVariance = calculateVariance(pitches);
    const pitchRange = pitches.length > 0 ? Math.max(...pitches) - Math.min(...pitches) : 0;
    
    // Calculate energy
    const energy = calculateEnergy(floatSamples);
    
    // Calculate consistency
    const consistency = calculateConsistency(floatSamples);
    
    const features = {
      volume,
      pitchVariance,
      energy,
      consistency,
      averagePitch,
      pitchRange
    };
    
    console.log('Extracted audio features:', features);
    return features;
    
  } catch (error) {
    console.error('Error extracting audio features:', error);
    // Return default values if analysis fails
    return {
      volume: 0.5,
      pitchVariance: 50,
      energy: 0.5,
      consistency: 0.5,
      averagePitch: 150,
      pitchRange: 100
    };
  }
}

function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateEnergy(samples: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    energy += Math.abs(samples[i]);
  }
  return energy / samples.length;
}

function calculateConsistency(samples: Float32Array): number {
  const windowSize = 4096;
  const hopSize = 2048;
  const volumes: number[] = [];
  
  for (let i = 0; i < samples.length - windowSize; i += hopSize) {
    const window = samples.slice(i, i + windowSize);
    const windowVolume = calculateRMS(window);
    volumes.push(windowVolume);
  }
  
  if (volumes.length === 0) return 0.5;
  
  const volumeVariance = calculateVariance(volumes);
  return Math.max(0, 1 - (volumeVariance * 5)); // Normalize to 0-1
}

function extractPitches(samples: Float32Array, sampleRate: number): number[] {
  const pitches: number[] = [];
  const windowSize = 4096; // Increased window size for better pitch detection
  const hopSize = 2048;
  
  console.log(`Starting pitch extraction: ${samples.length} samples, ${sampleRate}Hz`);
  
  // Apply pre-emphasis filter to enhance higher frequencies
  const preEmphasized = applyPreEmphasis(samples);
  
  for (let i = 0; i < preEmphasized.length - windowSize; i += hopSize) {
    const window = preEmphasized.slice(i, i + windowSize);
    
    // Apply Hamming window to reduce spectral leakage
    const windowed = applyHammingWindow(window);
    
    // Normalize the window
    const normalized = normalizeWindow(windowed);
    
    const pitch = autocorrelationPitch(normalized, sampleRate);
    if (pitch && pitch > 50 && pitch < 400) {
      pitches.push(pitch);
    }
  }
  
  console.log(`Extracted ${pitches.length} pitch measurements:`, pitches.slice(0, 10)); // Show first 10
  return pitches;
}

function applyPreEmphasis(samples: Float32Array): Float32Array {
  const result = new Float32Array(samples.length);
  result[0] = samples[0];
  
  for (let i = 1; i < samples.length; i++) {
    result[i] = samples[i] - 0.97 * samples[i - 1];
  }
  
  return result;
}

function applyHammingWindow(samples: Float32Array): Float32Array {
  const result = new Float32Array(samples.length);
  
  for (let i = 0; i < samples.length; i++) {
    const windowValue = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (samples.length - 1));
    result[i] = samples[i] * windowValue;
  }
  
  return result;
}

function normalizeWindow(samples: Float32Array): Float32Array {
  // Calculate RMS
  let rms = 0;
  for (let i = 0; i < samples.length; i++) {
    rms += samples[i] * samples[i];
  }
  rms = Math.sqrt(rms / samples.length);
  
  if (rms === 0) return samples;
  
  // Normalize to prevent division by zero
  const result = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    result[i] = samples[i] / rms;
  }
  
  return result;
}

function autocorrelationPitch(samples: Float32Array, sampleRate: number): number | null {
  const minPeriod = Math.floor(sampleRate / 400); // 400 Hz max
  const maxPeriod = Math.floor(sampleRate / 50);  // 50 Hz min
  
  console.log(`Autocorrelation: sampleRate=${sampleRate}, minPeriod=${minPeriod}, maxPeriod=${maxPeriod}, samples.length=${samples.length}`);
  
  // Calculate autocorrelation
  const autocorr = calculateAutocorrelation(samples, maxPeriod);
  
  // Find the best peak (excluding the zero-lag peak)
  let bestPeriod = 0;
  let bestCorrelation = 0;
  
  for (let period = minPeriod; period <= maxPeriod; period++) {
    const correlation = autocorr[period];
    
    // Check if this is a local maximum
    if (correlation > bestCorrelation && 
        period > 0 && period < maxPeriod &&
        correlation > autocorr[period - 1] && 
        correlation > autocorr[period + 1]) {
      bestCorrelation = correlation;
      bestPeriod = period;
    }
  }
  
  console.log(`Best autocorrelation: period=${bestPeriod}, correlation=${bestCorrelation.toFixed(4)}`);
  
  // Lower the threshold significantly - autocorrelation values are typically much smaller
  const threshold = 0.01; // Much lower threshold
  if (bestCorrelation < threshold) {
    console.log(`Correlation ${bestCorrelation.toFixed(4)} below threshold ${threshold}`);
    return null;
  }
  
  const pitch = bestPeriod > 0 ? sampleRate / bestPeriod : null;
  console.log(`Calculated pitch: ${pitch?.toFixed(1)} Hz`);
  return pitch;
}

function calculateAutocorrelation(samples: Float32Array, maxLag: number): number[] {
  const autocorr = new Array(maxLag + 1);
  
  for (let lag = 0; lag <= maxLag; lag++) {
    let correlation = 0;
    
    for (let i = 0; i < samples.length - lag; i++) {
      correlation += samples[i] * samples[i + lag];
    }
    
    // Normalize by the number of samples used
    autocorr[lag] = correlation / (samples.length - lag);
  }
  
  return autocorr;
}

export function calculateConfidenceCategory(
  audioFeatures: AudioFeatures,
  speechMetrics: {
    rateOfSpeech: number;
    fillerWordCount: number;
    fluencyScore: number;
    durationMinutes: number;
  }
): "monotone" | "confident" | "hesitant" {
  const { volume, pitchVariance, energy, consistency, averagePitch, pitchRange } = audioFeatures;
  const { rateOfSpeech, fillerWordCount, fluencyScore } = speechMetrics;
  
  let confidenceScore = 0;
  
  console.log('Calculating confidence with:', { audioFeatures, speechMetrics });
  
  // Volume analysis (confident speakers have adequate, steady volume)
  if (volume > 0.15 && volume < 0.8) {
    confidenceScore += 2;
  } else if (volume < 0.05) {
    confidenceScore -= 2; // Too quiet = hesitant
  } else if (volume > 0.9) {
    confidenceScore -= 1; // Too loud might indicate nervousness
  }
  
  // Pitch variation (confident speakers have good pitch variation)
  if (pitchVariance > 30 && pitchRange > 50) {
    confidenceScore += 2; // Good variation = confident
  } else if (pitchVariance < 15 || pitchRange < 20) {
    confidenceScore -= 2; // Monotone = monotone category
  }
  
  // Speech rate (confident speakers maintain steady, appropriate pace)
  if (rateOfSpeech >= 120 && rateOfSpeech <= 160) {
    confidenceScore += 2;
  } else if (rateOfSpeech < 80) {
    confidenceScore -= 2; // Too slow = hesitant
  } else if (rateOfSpeech > 200) {
    confidenceScore -= 1; // Too fast = nervous
  }
  
  // Filler words (confident speakers use fewer)
  if (fillerWordCount <= 3) {
    confidenceScore += 2;
  } else if (fillerWordCount >= 10) {
    confidenceScore -= 2;
  } else if (fillerWordCount >= 6) {
    confidenceScore -= 1;
  }
  
  // Energy and consistency
  if (energy > 0.3 && consistency > 0.6) {
    confidenceScore += 1;
  } else if (energy < 0.1 || consistency < 0.3) {
    confidenceScore -= 1;
  }
  
  // Fluency score consideration
  if (fluencyScore >= 7) {
    confidenceScore += 1;
  } else if (fluencyScore <= 4) {
    confidenceScore -= 1;
  }
  
  // Average pitch consideration (very high or very low pitch might indicate stress)
  if (averagePitch > 50 && averagePitch < 350) {
    if (averagePitch > 200) {
      confidenceScore -= 0.5; // High pitch might indicate nervousness
    }
  } else {
    confidenceScore -= 1; // Unnatural pitch range
  }
  
  // Determine category based on total score
  let category: "monotone" | "confident" | "hesitant";
  if (confidenceScore >= 6) {
    category = "confident";
  } else if (confidenceScore >= 2) {
    category = "monotone";
  } else {
    category = "hesitant";
  }
  
  console.log(`Confidence calculation: score=${confidenceScore}, category=${category}`);
  return category;
}