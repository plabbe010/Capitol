import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tradesRouter from "./trades";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tradesRouter);
router.use(aiRouter);

export default router;
