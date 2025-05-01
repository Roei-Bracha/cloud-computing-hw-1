import { APIGatewayProxyHandler } from "aws-lambda";
import { getEntry, finalizeEntry } from "../lib/storage";
import { calculateFee } from "../lib/billing";

export const handler: APIGatewayProxyHandler = async (event: any) => {
    const params = event.queryStringParameters || {};
    const ticketId = params.ticketId;

    if (!ticketId) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing 'ticketId' parameter" }) };
    }

    try {
        const entry = await getEntry(ticketId);
        if (!entry) {
            return { statusCode: 404, body: JSON.stringify({ error: "Ticket not found" }) };
        }

        const now = Date.now();
        const durationMs = now - entry.entryTime;
        const charge = calculateFee(durationMs);

        await finalizeEntry(ticketId, now, charge);

        return {
            statusCode: 200,
            body: JSON.stringify({
                plate: entry.plate,
                parkingLot: entry.parkingLot,
                parkedTimeMs: durationMs,
                charge,
            }),
        };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};