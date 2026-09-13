import express from "express";
import { auth } from "../middleware/auth.js";
import {
  getCurrentUser,
  updateCurrentUser
  registerOrLogin,
  getUserByEmail,
  loginWithPassword,
  verifyToken,
} from "../controllers/authController.js";

const router = express.Router();

//Protected routes (require Firebase token)
router.get("/me", auth, getCurrentUser);
router.patch("/me",auth,updateCurrentUser)
router.get("/user/:email", auth, getUserByEmail);

//Public routes
router.post("/register-or-login", registerOrLogin)
router.post("/login", loginWithPassword);
router.post("/verify-token", verifyToken);
// router.get("/check-email/:email", checkEmail);

export default router;