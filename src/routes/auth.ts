import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new HttpError(500, "JWT_SECRET_NOT_CONFIGURED", "JWT secret is not configured");
    }

    const { email, password } = loginSchema.parse(req.body);
    const staffUser = await prisma.staffUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
        role: true,
        isActive: true
      }
    });

    if (!staffUser || !staffUser.isActive) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, staffUser.passwordHash);

    if (!passwordMatches) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const token = jwt.sign(
      {
        sub: staffUser.id,
        email: staffUser.email,
        role: staffUser.role
      },
      jwtSecret,
      { expiresIn: "8h" }
    );

    res.json({
      status: "ok",
      data: {
        token,
        staff: {
          id: staffUser.id,
          email: staffUser.email,
          name: staffUser.name,
          role: staffUser.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
});
