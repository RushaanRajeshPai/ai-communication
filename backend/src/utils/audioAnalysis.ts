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
    const wavBuffer = fs.readFileSync(wavFilePath);
    
    console.log(`Total WAV file size: ${wavBuffer.length} bytes`);
    
    // Verify WAV header
    const riffHeader = wavBuffer.toString('ascii', 0, 4);
    const waveHeader = wavBuffer.toString('ascii', 8, 12);
    
    if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
      throw new Error(`Invalid WAV file: RIFF=${riffHeader}, WAVE=${waveHeader}`);
    }
    
    // Find the 'data' chunk (it might not be at offset 36)
    let dataStart = -1;
    let dataSize = 0;
    
    for (let i = 12; i < wavBuffer.length - 8; i++) {
      const chunkId = wavBuffer.toString('ascii', i, i + 4);
      if (chunkId === 'data') {
        dataSize = wavBuffer.readUInt32LE(i + 4);
        dataStart = i + 8;
        console.log(`Found data chunk at offset ${i}, size: ${dataSize} bytes`);
        break;
      }
    }
    
    if (dataStart === -1 || dataSize === 0) {
      throw new Error('Could not find valid data chunk in WAV file');
    }
    
    // Read format chunk
    const sampleRate = wavBuffer.readUInt32LE(24);
    const bitsPerSample = wavBuffer.readUInt16LE(34);
    const numChannels = wavBuffer.readUInt16LE(22);
    
    console.log(`WAV Info: ${sampleRate}Hz, ${bitsPerSample}bit, ${numChannels}ch`);
    console.log(`Data: ${dataSize} bytes starting at offset ${dataStart}`);
    
    // Verify we have enough data
    const expectedSamples = dataSize / (bitsPerSample / 8) / numChannels;
    console.log(`Expected samples: ${expectedSamples}`);
    
    if (expectedSamples < 4096) {
      console.warn(`WARNING: Only ${expectedSamples} samples available. Need at least 4096 for reliable analysis.`);
      console.warn('Audio recording may be too short or corrupted.');
    }
    
    // Convert to float samples
    const samples: number[] = [];
    const bytesPerSample = bitsPerSample / 8;
    const stride = bytesPerSample * numChannels;
    
    for (let i = dataStart; i < dataStart + dataSize && i < wavBuffer.length; i += stride) {
      if (i + bytesPerSample > wavBuffer.length) break;
      
      let sample: number;
      
      if (bitsPerSample === 16) {
        sample = wavBuffer.readInt16LE(i) / 32768.0;
      } else if (bitsPerSample === 32) {
        sample = wavBuffer.readFloatLE(i);
      } else if (bitsPerSample === 8) {
        sample = (wavBuffer.readUInt8(i) - 128) / 128.0;
      } else {
        throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
      }
      
      samples.push(sample);
    }
    
    console.log(`Successfully extracted ${samples.length} samples`);
    
    if (samples.length === 0) {
      throw new Error('No valid samples found');
    }
    
    if (samples.length < 1000) {
      throw new Error(`Insufficient samples (${samples.length}). Audio file may be corrupted or too short.`);
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
    throw error; // Re-throw instead of returning defaults
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
  return Math.max(0, 1 - (volumeVariance * 5));
}

function extractPitches(samples: Float32Array, sampleRate: number): number[] {
  const pitches: number[] = [];
  const windowSize = 4096;
  const hopSize = 2048;
  
  if (samples.length < windowSize) {
    console.warn(`Sample length ${samples.length} is less than window size ${windowSize}. Cannot extract pitch.`);
    return [];
  }
  
  console.log(`Starting pitch extraction: ${samples.length} samples, ${sampleRate}Hz`);
  
  const preEmphasized = applyPreEmphasis(samples);
  
  for (let i = 0; i < preEmphasized.length - windowSize; i += hopSize) {
    const window = preEmphasized.slice(i, i + windowSize);
    const windowed = applyHammingWindow(window);
    const normalized = normalizeWindow(windowed);
    
    const pitch = autocorrelationPitch(normalized, sampleRate);
    if (pitch && pitch > 50 && pitch < 400) {
      pitches.push(pitch);
    }
  }
  
  console.log(`Extracted ${pitches.length} pitch measurements`);
  if (pitches.length > 0) {
    console.log(`Pitch range: ${Math.min(...pitches).toFixed(1)} - ${Math.max(...pitches).toFixed(1)} Hz`);
  }
  
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
  let rms = 0;
  for (let i = 0; i < samples.length; i++) {
    rms += samples[i] * samples[i];
  }
  rms = Math.sqrt(rms / samples.length);
  
  if (rms === 0) return samples;
  
  const result = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    result[i] = samples[i] / rms;
  }
  
  return result;
}

function autocorrelationPitch(samples: Float32Array, sampleRate: number): number | null {
  const minPeriod = Math.floor(sampleRate / 400);
  const maxPeriod = Math.floor(sampleRate / 50);
  
  const autocorr = calculateAutocorrelation(samples, maxPeriod);
  
  let bestPeriod = 0;
  let bestCorrelation = 0;
  
  for (let period = minPeriod; period <= maxPeriod; period++) {
    const correlation = autocorr[period];
    
    if (correlation > bestCorrelation && 
        period > 0 && period < maxPeriod &&
        correlation > autocorr[period - 1] && 
        correlation > autocorr[period + 1]) {
      bestCorrelation = correlation;
      bestPeriod = period;
    }
  }
  
  const threshold = 0.01;
  if (bestCorrelation < threshold) {
    return null;
  }
  
  return bestPeriod > 0 ? sampleRate / bestPeriod : null;
}

function calculateAutocorrelation(samples: Float32Array, maxLag: number): number[] {
  const autocorr = new Array(maxLag + 1);
  
  for (let lag = 0; lag <= maxLag; lag++) {
    let correlation = 0;
    
    for (let i = 0; i < samples.length - lag; i++) {
      correlation += samples[i] * samples[i + lag];
    }
    
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
  
  // Volume analysis
  if (volume > 0.15 && volume < 0.8) {
    confidenceScore += 2;
  } else if (volume < 0.05) {
    confidenceScore -= 2;
  } else if (volume > 0.9) {
    confidenceScore -= 1;
  }
  
  // Pitch variation
  if (pitchVariance > 30 && pitchRange > 50) {
    confidenceScore += 2;
  } else if (pitchVariance < 15 || pitchRange < 20) {
    confidenceScore -= 2;
  }
  
  // Speech rate
  if (rateOfSpeech >= 120 && rateOfSpeech <= 160) {
    confidenceScore += 2;
  } else if (rateOfSpeech < 80) {
    confidenceScore -= 2;
  } else if (rateOfSpeech > 200) {
    confidenceScore -= 1;
  }
  
  // Filler words
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
  
  // Fluency score
  if (fluencyScore >= 7) {
    confidenceScore += 1;
  } else if (fluencyScore <= 4) {
    confidenceScore -= 1;
  }
  
  // Average pitch
  if (averagePitch > 50 && averagePitch < 350) {
    if (averagePitch > 200) {
      confidenceScore -= 0.5;
    }
  } else {
    confidenceScore -= 1;
  }
  
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