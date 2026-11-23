import YAML from "yaml";
import { LAMBDA_SOURCE } from "./lambda-source.js";

/**
 * The CloudFormation template that connects a CloudWatch log group to
 * Codewarden.
 *
 * The customer runs it in the account that produces the logs. It creates the
 * forwarder function, gives it the permission to read the log group and
 * attaches the subscription filter that forwards the matching events.
 *
 * The template is generated per workspace, so the ingest key, the workspace
 * and the owner are already filled in and the customer only has to press
 * create.
 */

const DEFAULT_FILTER_PATTERN = "?ERROR ?Exception ?FATAL ?CRITICAL ?Uncaught";

/**
 * The inline ZipFile option of CloudFormation accepts at most 4096
 * characters. The check is here so a change to the forwarder that does not
 * fit is reported while the template is built, and not by CloudFormation
 * after the customer already filled in the form.
 */
const INLINE_SOURCE_LIMIT = 4096;

function describeRepository(repoUrl: string): string {
  return String(repoUrl ?? "")
    .replace(/^git\+/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^git@github\.com:/i, "https://github.com/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
}

export interface CloudFormationInput {
  workspaceId: string;
  ownerUid: string;
  ingestKey: string;
  apiUrl: string;
  repoUrl: string;
  branch: string;
  logGroupName: string;
  filterPattern?: string;
  contextLines?: number;
  lambdaMemorySize?: number;
  lambdaTimeout?: number;
  logRetentionDays?: number;
}

export function buildCloudFormationTemplate({
  workspaceId,
  ownerUid,
  ingestKey,
  apiUrl,
  repoUrl,
  branch,
  logGroupName,
  filterPattern = DEFAULT_FILTER_PATTERN,
  contextLines = 40,
  lambdaMemorySize = 256,
  lambdaTimeout = 60,
  logRetentionDays = 14,
}: CloudFormationInput): { template: unknown; yaml: string } {
  if (LAMBDA_SOURCE.length > INLINE_SOURCE_LIMIT) {
    throw new Error(
      `The forwarder source is ${LAMBDA_SOURCE.length} characters, the inline template allows ${INLINE_SOURCE_LIMIT}.`,
    );
  }

  const logGroupArn = `arn:aws:logs:*:*:log-group:${logGroupName}:*`;

  const template = {
    AWSTemplateFormatVersion: "2010-09-09",
    Description:
      "Forwards the errors of a CloudWatch log group to the Codewarden API, where the agent " +
      "finds the root cause and opens a branch with the fix.",
    Metadata: {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "Codewarden" },
            Parameters: [
              "CodewardenApiUrl",
              "IngestKey",
              "WorkspaceId",
              "OwnerUid",
            ],
          },
          {
            Label: { default: "Log source" },
            Parameters: ["LogGroupName", "FilterPattern", "ContextLines"],
          },
          {
            Label: { default: "Tuning" },
            Parameters: [
              "LambdaMemorySize",
              "LambdaTimeout",
              "LogRetentionDays",
            ],
          },
        ],
        ParameterLabels: {
          CodewardenApiUrl: { default: "Codewarden API url" },
          IngestKey: { default: "Ingest key" },
          WorkspaceId: { default: "Workspace id" },
          OwnerUid: { default: "Owner id" },
          LogGroupName: { default: "CloudWatch log group" },
          FilterPattern: { default: "Subscription filter pattern" },
          ContextLines: { default: "Log lines of context" },
        },
      },
    },
    Parameters: {
      CodewardenApiUrl: {
        Type: "String",
        Description:
          "The public url of the Codewarden API that receives the log events.",
        Default: apiUrl,
        AllowedPattern: "^https?://.+",
      },
      IngestKey: {
        Type: "String",
        Description: "The key that proves the events belong to this workspace.",
        Default: ingestKey,
        NoEcho: true,
      },
      WorkspaceId: {
        Type: "String",
        Description: "The Codewarden workspace the events belong to.",
        Default: workspaceId,
      },
      OwnerUid: {
        Type: "String",
        Description: "The Codewarden account that owns the workspace.",
        Default: ownerUid,
      },
      LogGroupName: {
        Type: "String",
        Description:
          "The name of the existing CloudWatch log group to watch, for example /aws/lambda/payments.",
      },
      FilterPattern: {
        Type: "String",
        Description:
          "Which log events are forwarded. The default matches the usual error words. " +
          "Leave it empty to forward every event.",
        Default: filterPattern,
      },
      ContextLines: {
        Type: "Number",
        Description:
          "How many log lines around the error are read from the log stream and sent along, " +
          "so the stack trace is complete. Set it to 0 to send the matched lines only.",
        Default: contextLines,
        MinValue: 0,
        MaxValue: 500,
      },
      LambdaMemorySize: {
        Type: "Number",
        Description: "The memory of the forwarder in megabytes.",
        Default: lambdaMemorySize,
        MinValue: 128,
        MaxValue: 1024,
      },
      LambdaTimeout: {
        Type: "Number",
        Description: "How long the forwarder may take, in seconds.",
        Default: lambdaTimeout,
        MinValue: 10,
        MaxValue: 300,
      },
      LogRetentionDays: {
        Type: "Number",
        Description: "How long the logs of the forwarder itself are kept.",
        Default: logRetentionDays,
        AllowedValues: [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365],
      },
    },
    Resources: {
      CodewardenIngestRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  Service: ["lambda.amazonaws.com"],
                },
                Action: ["sts:AssumeRole"],
              },
            ],
          },
          ManagedPolicyArns: [
            "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
          Policies: [
            {
              PolicyName: "codewarden-read-log-group",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: [
                      "logs:FilterLogEvents",
                      "logs:GetLogEvents",
                      "logs:DescribeLogStreams",
                    ],
                    Resource: logGroupArn,
                  },
                  {
                    Effect: "Allow",
                    Action: ["sqs:SendMessage"],
                    Resource: {
                      "Fn::GetAtt": ["CodewardenIngestDeadLetterQueue", "Arn"],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      CodewardenIngestDeadLetterQueue: {
        Type: "AWS::SQS::Queue",
        Properties: {
          MessageRetentionPeriod: 1209600,
          QueueName: { "Fn::Sub": "codewarden-ingest-${AWS::StackName}-dlq" },
        },
      },
      CodewardenIngestFunction: {
        Type: "AWS::Lambda::Function",
        DependsOn: ["CodewardenIngestRole"],
        Properties: {
          FunctionName: { "Fn::Sub": "codewarden-ingest-${AWS::StackName}" },
          Description:
            "Forwards the CloudWatch log events of this workspace to the Codewarden API.",
          Runtime: "nodejs22.x",
          Handler: "index.handler",
          Role: { "Fn::GetAtt": ["CodewardenIngestRole", "Arn"] },
          MemorySize: { Ref: "LambdaMemorySize" },
          Timeout: { Ref: "LambdaTimeout" },
          DeadLetterConfig: {
            TargetArn: {
              "Fn::GetAtt": ["CodewardenIngestDeadLetterQueue", "Arn"],
            },
          },
          Environment: {
            Variables: {
              CODEWARDEN_API_URL: { Ref: "CodewardenApiUrl" },
              CODEWARDEN_INGEST_KEY: { Ref: "IngestKey" },
              CODEWARDEN_WORKSPACE_ID: { Ref: "WorkspaceId" },
              CODEWARDEN_OWNER_UID: { Ref: "OwnerUid" },
              CODEWARDEN_CONTEXT_LINES: { Ref: "ContextLines" },
            },
          },
          Code: {
            ZipFile: LAMBDA_SOURCE,
          },
        },
      },
      CodewardenIngestEventConfig: {
        Type: "AWS::Lambda::EventInvokeConfig",
        Properties: {
          FunctionName: {
            "Fn::GetAtt": ["CodewardenIngestFunction", "Arn"],
          },
          Qualifier: "$LATEST",
          DestinationConfig: {
            OnFailure: {
              Destination: {
                "Fn::GetAtt": ["CodewardenIngestDeadLetterQueue", "Arn"],
              },
            },
          },
          MaximumRetryAttempts: 2,
        },
      },
      CodewardenIngestPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { "Fn::GetAtt": ["CodewardenIngestFunction", "Arn"] },
          Principal: "logs.amazonaws.com",
          SourceArn: {
            "Fn::Sub":
              "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:${LogGroupName}:*",
          },
        },
      },
      CodewardenSubscriptionFilter: {
        Type: "AWS::Logs::SubscriptionFilter",
        DependsOn: ["CodewardenIngestPermission"],
        Properties: {
          LogGroupName: { Ref: "LogGroupName" },
          FilterPattern: { Ref: "FilterPattern" },
          DestinationArn: { "Fn::GetAtt": ["CodewardenIngestFunction", "Arn"] },
        },
      },
    },
    Outputs: {
      ForwarderFunctionArn: {
        Description:
          "The forwarder that forwards the log events to Codewarden.",
        Value: { "Fn::GetAtt": ["CodewardenIngestFunction", "Arn"] },
      },
      SubscriptionFilterName: {
        Description: "The subscription filter that reads the log group.",
        Value: { Ref: "CodewardenSubscriptionFilter" },
      },
      DeadLetterQueueUrl: {
        Description:
          "The queue that holds the events Codewarden could not accept.",
        Value: { Ref: "CodewardenIngestDeadLetterQueue" },
      },
      Repository: {
        Description: "The repository the events are analysed against.",
        Value: `${describeRepository(repoUrl)}@${branch}`,
      },
    },
  };

  return {
    template,
    yaml: YAML.stringify(template, { lineWidth: 0 }),
  };
}

export { DEFAULT_FILTER_PATTERN };
