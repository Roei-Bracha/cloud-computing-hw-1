# Cloud-Based Parking Lot Management System

A serverless application for managing parking lot entries and exits, deployed on Google Cloud Platform.

## Architecture

This system consists of a single microservice with two endpoints:

1. **/entry**: Records vehicle entry and issues a ticket
2. **/exit**: Processes vehicle exit and calculates the parking fee

### Technology Stack

- **Backend**: Node.js with Express
- **Database**: Firestore (NoSQL)
- **Deployment**: Google Cloud Run (serverless containers)
- **Infrastructure as Code**: Pulumi (TypeScript)
- **Containerization**: Docker

## Features

- Record vehicle entry with license plate and parking lot ID
- Generate unique ticket IDs for each entry
- Calculate parking fees based on duration ($10/hour, prorated in 15-minute increments)
- Stateless design for high scalability
- Optimized for low latency and cost-effectiveness

## API Endpoints

Both endpoints are available from a single base URL:

### Entry Endpoint

```
POST /entry?plate={plate}&parkingLot={lotId}
```

**Response:**

```json
{
  "ticketId": "unique-ticket-id"
}
```

### Exit Endpoint

```
POST /exit?ticketId={ticketId}
```

**Response:**

```json
{
  "plate": "ABC123",
  "parkingLot": "LOT1",
  "totalTimeMinutes": 65,
  "charge": 20.0
}
```

## Setup and Deployment

### Prerequisites

1. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
2. [Node.js](https://nodejs.org/) (v16 or higher)
3. [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
4. [Docker](https://www.docker.com/get-started/) (for building containers)

### GCP Project Setup

1. Create a new GCP project (or use an existing one)
2. Enable billing for the project
3. Create service account with the following permissions:
   - Cloud Run Admin
   - Artifact Registry Admin
   - Firestore Admin
   - Storage Admin

### Environment Setup

1. Authenticate with Google Cloud:

   ```
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. Configure Docker with GCP:

   ```
   gcloud auth configure-docker
   ```

3. Install Pulumi dependencies:

   ```
   cd pulumi
   npm install
   npm install @pulumi/docker
   ```

4. Set Pulumi configuration:
   ```
   pulumi config set gcp:project YOUR_PROJECT_ID
   pulumi config set gcp:region us-central1  # or your preferred region
   ```

### Deployment

Deploy the entire stack with Pulumi:

```
cd pulumi
pulumi up
```

This command will:

1. Enable required GCP services
2. Create a Firestore database
3. Build and push the Docker image to Google Container Registry
4. Deploy the parking lot service to Cloud Run
5. Configure permissions for public access
6. Output the service endpoint

### Testing the Deployment

After deployment, Pulumi will output the service URL. You can test the endpoints with:

1. Entry:

   ```
   curl -X POST "https://parking-lot-service-xyz.run.app/entry?plate=ABC123&parkingLot=LOT1"
   ```

2. Exit (use the ticketId returned from the entry call):
   ```
   curl -X POST "https://parking-lot-service-xyz.run.app/exit?ticketId=YOUR_TICKET_ID"
   ```

## Cleanup

To destroy all resources and avoid incurring charges:

```
cd pulumi
pulumi destroy
```

## Performance Considerations

- The application leverages Google Cloud Run's auto-scaling to handle varying loads
- Firestore provides high availability and scales with your traffic
- Containerized services ensure consistent deployment and scaling

## Future Improvements

- Add authentication and authorization
- Implement logging and monitoring
- Add admin dashboard for parking lot management
- Support for different rate plans
- Integration with payment gateways
