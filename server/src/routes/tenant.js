import { Router } from "express";
import { prisma } from "../prisma.js";

// PUBLIC (no auth) tenant branding lookup. The login screen calls this with a
// slug coming from a branded link / QR (?t=<slug>) to decide which backdrop &
// wording to show BEFORE the user signs in. Only non-sensitive fields are
// exposed.
export const tenantRouter = Router();

tenantRouter.get("/tenant/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").toLowerCase().trim();
  if (!slug) return res.status(400).json({ message: "slug required" });
  const society = await prisma.society.findUnique({
    where: { slug },
    select: { name: true, orgType: true, slug: true, active: true },
  });
  if (!society || !society.active) return res.status(404).json({ message: "Not found" });
  res.json({
    name: society.name,
    orgType: society.orgType || "society",
    slug: society.slug,
  });
});
