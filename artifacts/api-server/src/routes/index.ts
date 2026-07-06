import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import swipesRouter from "./swipes";
import matchesRouter from "./matches";
import messagesRouter from "./messages";
import feedbackRouter from "./feedback";
import boostsRouter from "./boosts";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/swipes", swipesRouter);
router.use("/matches", matchesRouter);
router.use("/messages", messagesRouter);
router.use("/feedback", feedbackRouter);
router.use("/boosts", boostsRouter);
router.use("/insights", insightsRouter);

export default router;
