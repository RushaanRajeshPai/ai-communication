import mongoose, { Schema, Document } from "mongoose";

interface Feedback {
  confidenceCategory: "monotone" | "confident" | "hesitant";
  rateOfSpeech: number;
  fluencyScore: number;
}

interface Recording {
  scenario: string;
  transcription: string;
  durationMinutes: number;
  feedback: Feedback;
  createdAt?: Date;
}

export interface IUser extends Document {
  fullname: string;
  email: string;
  password: string;
  role: "student" | "work";
  recordings: Recording[];
  overall: {
    totalDuration: number;
    avgConfidence?: string;
    avgRateOfSpeech: number;
    avgFluencyScore: number;
  };
}

const recordingSchema: Schema<Recording> = new Schema({
  scenario: { type: String, required: true },
  transcription: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  feedback: {
    confidenceCategory: { type: String, enum: ["monotone", "confident", "hesitant"], required: true },
    rateOfSpeech: { type: Number, required: true },
    fluencyScore: { type: Number, required: true }
  },
  createdAt: { type: Date, default: Date.now }
});

const userSchema: Schema<IUser> = new Schema({
  fullname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["student", "work"], required: true },
  recordings: [recordingSchema],
  overall: {
    totalDuration: { type: Number, default: 0 },
    avgConfidence: { type: String },
    avgRateOfSpeech: { type: Number, default: 0 },
    avgFluencyScore: { type: Number, default: 0 }
  }
});

export default mongoose.model<IUser>("User", userSchema);
