import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    WST_PYTHON: process.env.WST_PYTHON || null,
    OPENAI_MODEL: process.env.OPENAI_MODEL || null,
    has_OPENAI_KEY: Boolean(process.env.OPENAI_API_KEY),
    cwd: process.cwd(),
    node: process.version,
  });
}
