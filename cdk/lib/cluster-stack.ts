import cdk = require('@aws-cdk/cdk');
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');

export interface ClusterStackProps extends cdk.StackProps {
    cidr: string;
}

export class ClusterStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;
    public readonly cluster: ecs.Cluster;

    constructor(scope: cdk.Construct, id: string, props: ClusterStackProps) {
        super(scope, id, props);

        this.vpc = new ec2.Vpc(this, 'Vpc', {
            maxAZs: 3,
            cidr: props.cidr
        })

        this.cluster = new ecs.Cluster(this, 'FargateCluster', {
            vpc: this.vpc
        })
    }
}
