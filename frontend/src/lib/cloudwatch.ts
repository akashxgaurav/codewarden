import type { CloudWatchConnection } from "@/types";

/**
 * The regions a customer usually runs their log groups in.
 *
 * The list is a convenience, the field accepts every region name.
 */
export const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-north-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "sa-east-1",
  "ca-central-1",
];

/**
 * The filter that selects the interesting log events.
 *
 * It is the pattern of the CloudWatch subscription filter. The default
 * matches the usual error words, a customer with a different logging format
 * can change it. The API uses the same default when the pattern is not
 * given.
 */
export const DEFAULT_FILTER_PATTERN = "?ERROR ?Exception ?FATAL ?CRITICAL ?Uncaught";

/**
 * The connection of a workspace that was not set up yet.
 */
export function emptyCloudWatchConnection(): CloudWatchConnection {
  return {
    region: "eu-west-1",
    logGroupName: "",
    filterPattern: DEFAULT_FILTER_PATTERN,
    connected: false,
    connectedAt: null,
  };
}
