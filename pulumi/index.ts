import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as docker from "@pulumi/docker";

// Use the "gcp" config namespace for project and region
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.get("region") || "us-central1";

// Enable required APIs
const artifactRegistryApi = new gcp.projects.Service("artifact-registry-api", {
    service: "artifactregistry.googleapis.com",
    project: project,
});

const cloudRunApi = new gcp.projects.Service("cloud-run-api", {
    service: "run.googleapis.com",
    project: project,
});

const storageApi = new gcp.projects.Service("storage-api", {
    service: "storage.googleapis.com",
    project: project,
});

const firestoreApi = new gcp.projects.Service("firestore-api", {
    service: "firestore.googleapis.com",
    project: project,
});

const iamApi = new gcp.projects.Service("iam-api", {
    service: "iam.googleapis.com",
    project: project,
});

// This ensures the App Engine application exists, which is required for Firestore
// Only create if it doesn't already exist
const appEngineApp = new gcp.appengine.Application("app", {
    locationId: region.includes("us-central") ? "us-central" : region,
    databaseType: "CLOUD_FIRESTORE",
}, {
    protect: true,  // Protect from deletion
    ignoreChanges: ["*"],  // Ignore any changes to this resource
});

// Create a test document to ensure Firestore connectivity works
// This is lighter weight than creating a database or collection
const healthCheckDoc = new gcp.firestore.Document("health-check-doc", {
    collection: "_healthcheck",
    documentId: "status",
    fields: JSON.stringify({
        name: { stringValue: "health-check" },
        created: { timestampValue: new Date().toISOString() },
        status: { stringValue: "active" },
    }),
}, { dependsOn: [firestoreApi, appEngineApp] });

// Deploy the combined service
function deployParkingLotService() {
    // Build and push the Docker image
    const imageRepo = "gcr.io/" + project + "/parking-lot-service";
    const image = new docker.Image("parking-lot-service-image", {
        imageName: imageRepo,
        build: {
            context: "./functions/combined",
            platform: "linux/amd64",
        },
        registry: {
            server: "gcr.io",
        },
    }, { dependsOn: [artifactRegistryApi] });

    // Create a service account for the Cloud Run service
    const serviceAccount = new gcp.serviceaccount.Account("parking-lot-sa", {
        accountId: "parking-lot-service-sa",
        displayName: "Parking Lot Service Account",
        project: project,
    }, { dependsOn: [iamApi] });

    // Grant Firestore access to the service account
    const firestoreUserRole = new gcp.projects.IAMBinding("firestore-user-access", {
        members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
        role: "roles/datastore.user",
        project: project,
    });

    // Also grant Firestore owner role for more permissions
    const firestoreOwnerRole = new gcp.projects.IAMBinding("firestore-owner-access", {
        members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
        role: "roles/datastore.owner",
        project: project,
    });

    // Deploy Cloud Run service
    const service = new gcp.cloudrun.Service("parking-lot-service", {
        location: region,
        template: {
            spec: {
                serviceAccountName: serviceAccount.email,
                containers: [{
                    image: image.imageName,
                    resources: {
                        limits: {
                            memory: "256Mi",
                            cpu: "1",
                        },
                    },
                    envs: [{
                        name: "FIRESTORE_PROJECT",
                        value: project,
                    }, {
                        name: "NODE_ENV",
                        value: "production",
                    }, {
                        name: "DEBUG",
                        value: "true",
                    }],
                    ports: [{
                        containerPort: 8080,
                    }],
                }],
                containerConcurrency: 80, // Allow up to 80 concurrent requests per container
                timeoutSeconds: 300, // 5 minute timeout
            },
            metadata: {
                annotations: {
                    "autoscaling.knative.dev/minScale": "1", // Minimum number of instances
                    "autoscaling.knative.dev/maxScale": "10", // Maximum number of instances
                },
            },
        },
        traffics: [{
            percent: 100,
            latestRevision: true,
        }],
        autogenerateRevisionName: true,
    }, { dependsOn: [cloudRunApi, serviceAccount, firestoreUserRole, firestoreOwnerRole, healthCheckDoc] });

    // Make the service publicly accessible
    const iamMember = new gcp.cloudrun.IamMember("parking-lot-service-everyone", {
        service: service.name,
        location: region,
        role: "roles/run.invoker",
        member: "allUsers",
    });

    return {
        url: service.statuses[0].url,
        name: service.name,
    };
}

const parkingLotService = deployParkingLotService();

// Export the service URL
export const serviceUrl = parkingLotService.url;

// Export instructions for testing
export const entryEndpoint = pulumi.interpolate`${serviceUrl}/entry?plate=ABC123&parkingLot=LOT1`;
export const exitEndpoint = pulumi.interpolate`${serviceUrl}/exit?ticketId=TICKET_ID_HERE`;
export const statusEndpoint = pulumi.interpolate`${serviceUrl}/status`;