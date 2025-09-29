import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import User, { IUser } from "../models/User";

export const signup = async (req: Request, res: Response) => {
  try {
    const { fullname, email, password, role, gender, age } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullname,
      email,
      password: hashedPassword,
      role,
      gender,
      age,
      recordings: [],
      overall: {
        totalDuration: 0,
        avgRateOfSpeech: 0,
        avgFluencyScore: 0
      }
    });

    await newUser.save();
    res.status(201).json({ message: "User created successfully", userId: newUser._id });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};


export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    res.status(200).json({ message: "Login successful", userId: user._id, role: user.role });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const logout = async (req: Request, res: Response) => {
  res.status(200).json({ message: "Logout successful" });
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password'); // Exclude password
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      gender: user.gender,
      age: user.age
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
}; 

export const addRecording = async (req: Request, res: Response) => {
  try {
    const { userId, scenario, transcription, durationMinutes, feedback, fillerWordCount } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Push new recording
    user.recordings.push({ scenario, transcription, durationMinutes, feedback, fillerWordCount });

    // Update overall stats
    user.overall.totalDuration = user.recordings.reduce((sum, rec) => sum + rec.durationMinutes, 0);
    user.overall.avgRateOfSpeech =
      user.recordings.reduce((sum, rec) => sum + rec.feedback.rateOfSpeech, 0) / user.recordings.length;
    user.overall.avgFluencyScore =
      user.recordings.reduce((sum, rec) => sum + rec.feedback.fluencyScore, 0) / user.recordings.length;

    user.overall.totalFillerWords =
      user.recordings.reduce((sum, rec) => sum + (rec.fillerWordCount || 0), 0);

    await user.save();
    res.status(200).json({ message: "Recording added successfully", overall: user.overall });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};


