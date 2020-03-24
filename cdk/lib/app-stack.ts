
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import path = require('path');

export interface AppStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
    cluster: ecs.Cluster;
    appImage?: ecs.ContainerImage;
    nginxImage?: ecs.ContainerImage;
}

export class AppStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props: AppStackProps) {
        super(scope, id, props);

        // Create a task definition with 2 containers and CloudWatch Logs
        const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
            memoryLimitMiB: 512,            
            cpu: 256
        });
        
        // Add app container
        const appLogging = new ecs.AwsLogDriver({
            streamPrefix: "app"
        });

        const appImage = props.appImage || new ecs.AssetImage(path.join(__dirname, '../..', 'app'));

 
        const appContainer = taskDefinition.addContainer("app", {
            image: appImage,
            logging: appLogging
        });
        appContainer.addPortMappings({ containerPort: 3000 });

        // Add nginx container 
        const nginxLogging = new ecs.AwsLogDriver({
            streamPrefix: "nginx",
        });
        const nginxImage = props.nginxImage || new ecs.AssetImage(path.join(__dirname, '../..', 'nginx'));
        const nginxContainer = taskDefinition.addContainer("nginx", {
            image: nginxImage,
            logging: nginxLogging
        });
        nginxContainer.addPortMappings({ containerPort: 80 });

        // Instantiate Fargate Service with cluster and images
        const service = new ecs.FargateService(this, 'Service', {
            cluster: props.cluster,
            taskDefinition
        });

        // Setup autoscaling
        const scaling = service.autoScaleTaskCount({ maxCapacity: 4 });
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 50,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
          });

        scaling.scaleOnSchedule('ScheduleScalingUp', {
            minCapacity: 2,
            schedule: {
                expressionString: "cron(0 0 0/2 ? * *)"
            }
        })

        scaling.scaleOnSchedule('ScheduleScalingDown', {
            minCapacity: 1,
            schedule: {
                expressionString: "cron(0 0 1/2 ? * *)"
            }
        })

        // Add public ALB loadbalancer targetting service
        const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
            vpc: props.vpc,
            internetFacing: true
        });

        const listener = lb.addListener('HttpListener', {
            port: 80
        });

        listener.addTargets('DefaultTarget', {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [service]
        });

        // CfnOutput the DNS where you can access your service
        new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: lb.loadBalancerDnsName });
    }
}
