// Vercel Serverless Function
// Retorna a chave GEMINI_API_KEY configurada nas Environment Variables da Vercel
module.exports = (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const apiKey = process.env.GEMINI_API_KEY || "";
    return res.status(200).json({ apiKey });
};
