import * as AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";

const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.TABLE_NAME!;

export interface EntryRecord {
  ticketId: string;
  plate: string;
  parkingLot: string;
  entryTime: number;
  exitTime?: number;
  fee?: number;
}

export async function storeEntry(plate: string, parkingLot: string): Promise<string> {
  const ticketId = uuidv4();
  const record: EntryRecord = { ticketId, plate, parkingLot, entryTime: Date.now() };
  await ddb.put({ TableName: TABLE, Item: record }).promise();
  return ticketId;
}

export async function getEntry(ticketId: string): Promise<EntryRecord | null> {
  const result = await ddb.get({ TableName: TABLE, Key: { ticketId } }).promise();
  return result.Item as EntryRecord || null;
}

export async function finalizeEntry(ticketId: string, exitTime: number, fee: number): Promise<void> {
  await ddb.update({
    TableName: TABLE,
    Key: { ticketId },
    UpdateExpression: "SET exitTime = :exit, fee = :fee",
    ExpressionAttributeValues: { ":exit": exitTime, ":fee": fee },
  }).promise();
}