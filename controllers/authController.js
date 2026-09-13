import { firebaseAuth } from "../config/firebaseAdmin.js";
import User from "../models/User.js";

// Get current user (protected route)
export const getCurrentUser = async (req, res) => {
  try {
    res.json(req.user);
  } catch (err) {
    console.error("Get current user error:", err);
    res.status(500).json({ message: err.message });
  }
};
// Update Current User
export const updateCurrentUser(req,res){
     try {
    const { name, photo } = req.body;

    const firebaseUid = req.user.firebaseUid || req.user.uid;

    if (!firebaseUid) {
      return res.status(400).json({
        message: "Firebase UID not found",
      });
    }

    const user = await User.findOne({ firebaseUid });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (name !== undefined) {
      user.name = name;
    }

    if (photo !== undefined) {
      user.photo = photo;
    }

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: user.role,
        isPremium: user.isPremium,
        isBlocked: user.isBlocked,
      },
    });
  } catch (err) {
    console.error("Update current user error:", err);

    res.status(500).json({
      message: err.message,
    });
  }
}
//Register / Login with Firebase
export const registerOrLogin = async (req, res) => {
  try {
    const { firebaseUid, name, email, photo,password } = req.body;

    if (!firebaseUid || !email) {
      return res.status(400).json({
        message: "Firebase UID and email are required",
      });
    }

    // Find user by firebaseUid
    let user = await User.findOne({ firebaseUid });

    if (!user) {
      // Check if email exists with different firebaseUid
      const emailUser = await User.findOne({ email });

      if (emailUser && emailUser.firebaseUid !== firebaseUid) {
        return res.status(409).json({
          message: "Email already exists with different account",
        });
      }

      // Verify Firebase user exists
      try {
        await firebaseAuth.getUser(firebaseUid);
      } catch (firebaseError) {
        return res.status(400).json({
          message: "Invalid Firebase user",
        });
      }

      // Create new user in MongoDB
      const defaultName = name || email.split("@")[0] || "User";

      user = await User.create({
        firebaseUid,
        name: defaultName,
        email,
        password:password,
        photo: photo || "https://i.ibb.co/placeholder.jpg",
        role: "citizen",
        isPremium: false,
        isBlocked: false,
      });
    } else {
      // Update existing user if needed
      let updated = false;

      if (name && user.name !== name) {
        user.name = name;
        updated = true;
      }

      if (photo && user.photo !== photo) {
        user.photo = photo;
        updated = true;
      }

      if (updated) {
        await user.save();
      }
    }

    // Check if blocked
    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact support.",
      });
    }

    res.json({
      message: "Success",
      user: {
        _id: user._id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        photo: user.photo,
        password:user.password,
        role: user.role,
        isPremium: user.isPremium,
        isBlocked: user.isBlocked,
      },
    });
  } catch (err) {
    console.error("registerOrLogin error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        message: "Email already exists",
      });
    }

    res.status(500).json({ message: err.message });
  }
};

//Get user by email (protected)
export const getUserByEmail = async (req, res) => {
  try {
    const email = req.params.email;
    const user = await User.findOne({ email }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error("getUserByEmail error:", err);
    res.status(500).json({ message: err.message });
  }
};

//Login with password
export const loginWithPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // Find user in MongoDB
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if blocked
    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact support.",
      });
    }

    // Check password
    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Ensure Firebase user exists
    if (!user.firebaseUid) {
      try {
        // Try to get existing Firebase user
        const firebaseUser = await firebaseAuth.getUserByEmail(email);
        user.firebaseUid = firebaseUser.uid;
        await user.save();
      } catch (error) {
        // Create Firebase user if doesn't exist
        const newFirebaseUser = await firebaseAuth.createUser({
          email: user.email,
          password: user.password,
          displayName: user.name,
          photoURL: user.photo,
        });

        user.firebaseUid = newFirebaseUser.uid;
        await user.save();
      }
    }

    // Create custom Firebase token
    const customToken = await firebaseAuth.createCustomToken(user.firebaseUid);

    res.json({
      message: "Login successful",
      customToken,
      user: {
        _id: user._id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: user.role,
        isPremium: user.isPremium,
        isBlocked: user.isBlocked,
      },
    });
  } catch (err) {
    console.error("loginWithPassword error:", err);
    res.status(500).json({ message: err.message });
  }
};

//Verify Firebase token
export const verifyToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const decodedToken = await firebaseAuth.verifyIdToken(token);

    res.json({
      message: "Token is valid",
      uid: decodedToken.uid,
      email: decodedToken.email,
    });
  } catch (error) {
    console.error("verifyToken error:", error);
    res.status(401).json({
      message: "Invalid token",
      error: error.message,
    });
  }
};