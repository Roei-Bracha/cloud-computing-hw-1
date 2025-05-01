import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();

// DynamoDB Table
const table = new aws.dynamodb.Table("tickets", {
    attributes: [
        { name: "ticketId", type: "S" },
        { name: "plate", type: "S" },
    ],
    hashKey: "ticketId",
    globalSecondaryIndexes: [{
        name: "plateIndex",
        hashKey: "plate",
        projectionType: "ALL",
    }],
    billingMode: "PAY_PER_REQUEST",
});

// IAM Role for Lambdas
const lambdaRole = new aws.iam.Role("lambdaRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
        }],
    }),
});

new aws.iam.RolePolicyAttachment("basicExec", {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
});

new aws.iam.RolePolicy("dynamoPolicy", {
    role: lambdaRole.id,
    policy: pulumi.all([table.arn]).apply(([tableArn]) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:Query",
                "dynamodb:UpdateItem"
            ],
            Resource: [tableArn, `${tableArn}/index/*`],
        }]
    })),
});

// Package Lambda code
const lambdaArchive = new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileArchive("./src"),
});

// Entry Lambda
const entryLambda = new aws.lambda.Function("entryHandler", {
    runtime: "nodejs18.x",
    handler: "handlers/entry.handler",
    code: lambdaArchive,
    role: lambdaRole.arn,
    environment: { variables: { TABLE_NAME: table.name } },
});

// Exit Lambda
const exitLambda = new aws.lambda.Function("exitHandler", {
    runtime: "nodejs18.x",
    handler: "handlers/exit.handler",
    code: lambdaArchive,
    role: lambdaRole.arn,
    environment: { variables: { TABLE_NAME: table.name } },
});

// API Gateway
const api = new aws.apigateway.RestApi("parkingApi", {
    description: "Serverless Parking Lot API",
});

// /entry resource
const entryRes = new aws.apigateway.Resource("entryResource", {
    parentId: api.rootResourceId,
    pathPart: "entry",
    restApi: api.id,
});
const entryMethod = new aws.apigateway.Method("entryPOST", {
    restApi: api.id,
    resourceId: entryRes.id,
    httpMethod: "POST",
    authorization: "NONE",
});
const entryIntegration = new aws.apigateway.Integration("entryIntegration", {
    restApi: api.id,
    resourceId: entryRes.id,
    httpMethod: entryMethod.httpMethod,
    integrationHttpMethod: "POST",
    type: "AWS_PROXY",
    uri: entryLambda.invokeArn,
});

// /exit resource
const exitRes = new aws.apigateway.Resource("exitResource", {
    parentId: api.rootResourceId,
    pathPart: "exit",
    restApi: api.id,
});
const exitMethod = new aws.apigateway.Method("exitPOST", {
    restApi: api.id,
    resourceId: exitRes.id,
    httpMethod: "POST",
    authorization: "NONE",
});
const exitIntegration = new aws.apigateway.Integration("exitIntegration", {
    restApi: api.id,
    resourceId: exitRes.id,
    httpMethod: exitMethod.httpMethod,
    integrationHttpMethod: "POST",
    type: "AWS_PROXY",
    uri: exitLambda.invokeArn,
});

// Deployment
const deployment = new aws.apigateway.Deployment("deployment", {
    restApi: api.id,
    stageName: "prod",
}, { dependsOn: [entryIntegration, exitIntegration] });

deployment.stageName.apply(stage => console.log(`API Gateway URL: https://${api.id}.execute-api.${aws.config.region}.amazonaws.com/${stage}`));

export const apiUrl = pulumi.interpolate`https://${api.id}.execute-api.${aws.config.region}.amazonaws.com/prod`;