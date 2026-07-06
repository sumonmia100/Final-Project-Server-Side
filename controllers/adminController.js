import Issue from "../models/Issue.js";
import User from "../models/User.js";
import Timeline from "../models/Timeline.js";
import Payment from "../models/Payment.js";
import { firebaseAuth } from "../config/firebaseAdmin.js";
import mongoose from "mongoose";
// DASHBOARD STATS
export const getAdminStats = async (req, res) => {
  try {
    const totalIssues = await Issue.countDocuments();
    const resolvedIssues = await Issue.countDocuments({ status: "resolved" });
    const pendingIssues = await Issue.countDocuments({ status: "pending" });
    const rejectedIssues = await Issue.countDocuments({ status: "rejected" });
    const inProgressIssues = await Issue.countDocuments({ status: "in-progress" });

    const totalPayments = await Payment.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalRevenue = totalPayments.length > 0 ? totalPayments[0].total : 0;

    const latestIssues = await Issue.find()
      .populate("reporter", "name email")
      .sort({ createdAt: -1 })
      .limit(5);

    const latestPayments = await Payment.find()
      .populate("user", "name email")
      .populate("issue", "title")
      .sort({ createdAt: -1 })
      .limit(5);

    const latestUsers = await User.find({ role: "citizen" })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      stats: {
        totalIssues,
        resolvedIssues,
        pendingIssues,
        rejectedIssues,
        inProgressIssues,
        totalRevenue,
      },
      latestIssues,
      latestPayments,
      latestUsers,
    });
  } catch (err) {
    console.error("getAdminStats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ALL ISSUES (with filters, pagination, sorting)
export const getAllIssuesAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      priority,
      search
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const issues = await Issue.find(query)
      .populate("reporter", "name email")
      .populate("assignedStaff", "name email")
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Issue.countDocuments(query);

    res.json({
      issues,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error("getAllIssuesAdmin error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ASSIGN STAFF
export const assignStaff = async (req, res) => {
  try {
    const { staffId } = req.body;
    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    if (issue.assignedStaff) {
      return res.status(400).json({ message: "Staff already assigned to this issue" });
    }

    const staff = await User.findById(staffId);
    if (!staff || staff.role !== "staff") {
      return res.status(400).json({ message: "Invalid staff member" });
    }

    if (staff.isBlocked) {
      return res.status(400).json({ message: "This staff member is blocked" });
    }

    issue.assignedStaff = staffId;
    await issue.save();

    await Timeline.create({
      issue: issue._id,
      status: issue.status,
      message: `Staff ${staff.name} assigned to this issue`,
      updatedBy: req.user._id,
      role: "admin"
    });

    const updatedIssue = await Issue.findById(issue._id)
      .populate("reporter", "name email")
      .populate("assignedStaff", "name email");

    res.json(updatedIssue);
  } catch (err) {
    console.error("assignStaff error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// REJECT ISSUE
export const rejectIssue = async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    if (issue.status !== "pending") {
      return res.status(400).json({ message: "Only pending issues can be rejected" });
    }

    issue.status = "rejected";
    await issue.save();

    await Timeline.create({
      issue: issue._id,
      status: "rejected",
      message: "Issue rejected by admin",
      updatedBy: req.user._id,
      role: "admin"
    });

    res.json({ message: "Issue rejected successfully", issue });
  } catch (err) {
    console.error("rejectIssue error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// CREATE STAFF (Auto creates in Firebase)
export const createStaff = async (req, res) => {
  try {
    const { name, email, phone, photo, password } = req.body;

    
    if (!name || !email || !password) {
      return res.status(400).json({ 
        message: "Name, email and password are required" 
      });
    }

    // Check if user already exists in MongoDB
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    //Create user in Firebase Authentication
    let firebaseUser;
    try {
      firebaseUser = await firebaseAuth.createUser({
        email,
        password,
        displayName: name,
        photoURL: photo || "https://i.ibb.co/placeholder.jpg",
      });
      console.log("Firebase user created:", firebaseUser.uid);
    } catch (firebaseError) {
      console.error("Firebase createUser error:", firebaseError);

      if (firebaseError.code === "auth/email-already-exists") {
        return res.status(400).json({ 
          message: "Email already exists in Firebase Authentication" 
        });
      }
      return res.status(500).json({ 
        message: "Failed to create Firebase user: " + firebaseError.message 
      });
    }

    // Create user in MongoDB with role="staff"
    const staff = await User.create({
      name,
      email,
      password, // Store for backup (optional)
      photo: photo || "https://i.ibb.co/placeholder.jpg",
      phone: phone || "",
      role: "staff",
      firebaseUid: firebaseUser.uid,
      isPremium: false,
      isBlocked: false,
    });

    console.log("MongoDB staff created:", staff._id);

    res.status(201).json({ 
      message: "Staff created successfully", 
      staff: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        photo: staff.photo,
        phone: staff.phone,
        role: staff.role,
        firebaseUid: staff.firebaseUid,
      }
    });
  } catch (err) {
    console.error("createStaff error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// UPDATE STAFF
export const updateStaff = async (req, res) => {
  try {
    const { name, email, phone, photo, password } = req.body;
    
    const staff = await User.findById(req.params.id);
    if (!staff || staff.role !== "staff") {
      return res.status(404).json({ message: "Staff not found" });
    }

 
    if (email && email !== staff.email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: staff._id },
      });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    // Update in Firebase
    if (staff.firebaseUid) {
      try {
        const updateData = {};
        if (email && email !== staff.email) {
          updateData.email = email;
        }
        if (password) {
          updateData.password = password;
        }
        if (name) {
          updateData.displayName = name;
        }
        if (photo) {
          updateData.photoURL = photo;
        }

        if (Object.keys(updateData).length > 0) {
          await firebaseAuth.updateUser(staff.firebaseUid, updateData);
          console.log("Firebase user updated");
        }
      } catch (firebaseError) {
        console.error("Firebase updateUser error:", firebaseError);
        return res.status(500).json({
          message: "Failed to update Firebase user: " + firebaseError.message,
        });
      }
    }

    //Update in MongoDB
    staff.name = name || staff.name;
    staff.email = email || staff.email;
    staff.phone = phone || staff.phone;
    staff.photo = photo || staff.photo;
    if (password) {
      staff.password = password;
    }
    await staff.save();

    res.json({ 
      message: "Staff updated successfully", 
      staff: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        photo: staff.photo,
        phone: staff.phone,
        role: staff.role,
        firebaseUid: staff.firebaseUid,
      }
    });
  } catch (err) {
    console.error("updateStaff error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

//DELETE STAFF
export const deleteStaff = async (req, res) => {
  try {
    const staff = await User.findById(req.params.id);
    if (!staff || staff.role !== "staff") {
      return res.status(404).json({ message: "Staff not found" });
    }

    // Check assigned issues
    const Issue = mongoose.model("Issue");
    const assignedIssues = await Issue.countDocuments({ assignedStaff: staff._id });
    if (assignedIssues > 0) {
      return res.status(400).json({ 
        message: "Cannot delete staff with assigned issues. Please reassign first." 
      });
    }

    // Delete from Firebase
    if (staff.firebaseUid) {
      try {
        await firebaseAuth.deleteUser(staff.firebaseUid);
        console.log("Firebase user deleted");
      } catch (firebaseError) {
        console.error("Firebase deleteUser error:", firebaseError);
      }
    }

    //Delete from MongoDB
    await User.findByIdAndDelete(req.params.id);
    
    res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    console.error("deleteStaff error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

//GET ALL STAFF
export const getAllStaff = async (req, res) => {
  try {
    const staff = await User.find({ role: "staff" })
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(staff);
  } catch (err) {
    console.error("getAllStaff error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL USERS (Citizens)
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: "citizen" })
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error("getAllUsers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// BLOCK/UNBLOCK USER

export const blockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== "citizen") {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();
    if (user.isBlocked && user.firebaseUid) {
      try {
        await firebaseAuth.revokeRefreshTokens(user.firebaseUid);
      } catch (error) {
        console.error("Error revoking tokens:", error);
      }
    }

    res.json({ 
      message: `User ${user.isBlocked ? "blocked" : "unblocked"} successfully`, 
      user 
    });
  } catch (err) {
    console.error("blockUser error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL PAYMENTS
export const getAllPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      startDate,
      endDate
    } = req.query;

    const query = {};
    if (type) query.type = type;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const payments = await Payment.find(query)
      .populate("user", "name email")
      .populate("issue", "title")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Payment.countDocuments(query);

    res.json({
      payments,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error("getAllPayments error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET PAYMENT STATS
export const getPaymentStats = async (req, res) => {
  try {
    const monthlyStats = await Payment.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 }
    ]);

    res.json(monthlyStats);
  } catch (err) {
    console.error("getPaymentStats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};