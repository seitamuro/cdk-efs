import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class CdkEfsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      maxAzs: 2,
      createInternetGateway: true,
    });

    const fileSystemSecurityGroup = new ec2.SecurityGroup(
      this,
      "FileSystemSecurityGroup",
      {
        vpc: vpc,
      }
    );
    fileSystemSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(2049),
      "Allow inbound traffic on port 2049"
    );
    fileSystemSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic()
    );

    const fileSystem = new efs.FileSystem(this, "EfsFileSystem", {
      vpc: vpc,
      securityGroup: fileSystemSecurityGroup,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      fileSystemPolicy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            principals: [new iam.AnyPrincipal()],
            actions: ["*"],
            resources: ["*"],
            effect: iam.Effect.ALLOW,
          }),
        ],
      }),
    });

    const instanceRole = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });
    const ec2InstancePrivate = new ec2.Instance(this, "Ec2InstancePrivate", {
      vpc: vpc,
      instanceType: new ec2.InstanceType("t2.micro"),
      machineImage: new ec2.AmazonLinuxImage(),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      role: instanceRole,
    });
    ec2InstancePrivate.addUserData(
      "sudo su - ec2-user",
      "sudo yum install -y amazon-efs-utils",
      "mkdir /mnt/efs",
      `sudo mount -t efs -o tls ${fileSystem.fileSystemId}:/ /mnt/efs`
    );

    const ec2InstancePublic = new ec2.Instance(this, "Ec2InstancePublic", {
      vpc: vpc,
      instanceType: new ec2.InstanceType("t2.micro"),
      machineImage: new ec2.AmazonLinuxImage(),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      associatePublicIpAddress: true,
      role: instanceRole,
    });
    ec2InstancePublic.addUserData(
      "sudo su - ec2-user",
      "sudo yum install -y amazon-efs-utils",
      "sudo mkdir /mnt/efs",
      `sudo mount -t efs -o tls ${fileSystem.fileSystemId}:/ /mnt/efs`
    );
  }
}
