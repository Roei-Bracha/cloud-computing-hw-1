# Serverless Parking Lot Management

## Overview
A simple AWS serverless application to record vehicle entries/exits, calculate parking fees at $10/hr prorated per 15 min.

## Prerequisites
- Node.js >= 14
- Pulumi CLI
- AWS credentials configured (`aws configure`)

## Setup
1. **Clone repo**
   ```bash
   git clone <repo-url>
   cd parking-lot-management-system
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Configure AWS CLI profile (optional)**
   To isolate this app in its own AWS CLI profile:
   ```bash
   aws configure --profile parking-app
   pulumi config set aws:profile parking-app
   ```
4. **Configure Pulumi**
   ```bash
   pulumi stack init dev
   pulumi config set aws:region us-east-1
   ```

## Deploy
```bash
npm run build
pulumi up
```
- Confirm preview and allow.
- Note `apiUrl` output.

## Testing Endpoints
- **Entry**
  ```bash
  curl -X POST "${API_URL}/entry?plate=ABC123&parkingLot=Lot1"
  ```
- **Exit**
  ```bash
  curl -X POST "${API_URL}/exit?ticketId=<TICKET_ID>"
  ```

## Cost & Scaling
- **DynamoDB**: Pay-per-request for unpredictable workloads.
- **Lambda**: Keep handlers lightweight; use Node.js runtime for fast cold starts.
- **API Gateway**: Enable caching if endpoints return repeatable data.

---

## Teardown & Cleanup

To completely remove all resources deployed by Pulumi:

1. **Destroy the stack**  
   ```bash
   pulumi destroy -y
   ```
2. **Remove the stack state**  
   ```bash
   pulumi stack rm dev -y
   ```
3. **Verify no lingering resources**  
   Log into the AWS Console (or use the AWS CLI) and confirm that the DynamoDB table, Lambda functions, API Gateway, and IAM roles are gone.


