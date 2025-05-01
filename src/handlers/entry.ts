import { APIGatewayProxyHandler } from "aws-lambda";
import { storeEntry } from "../lib/storage";

export const handler: APIGatewayProxyHandler = async (event: any) => {
    const params = event.queryStringParameters || {};
    const plate = params.plate;
    const parkingLot = params.parkingLot;

    if (!plate || !parkingLot) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing 'plate' or 'parkingLot' parameter" }),
        };
    }

    try {
        const ticketId = await storeEntry(plate, parkingLot);
        return { statusCode: 200, body: JSON.stringify({ ticketId }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};