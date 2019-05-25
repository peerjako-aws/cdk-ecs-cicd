#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/cdk');

import { ClusterStack } from '../lib/cluster-stack';
import { AppStack } from '../lib/app-stack';
import { DevPipelineStack } from '../lib/dev-pipeline-stack';

const app = new cdk.App();

// Cluster Stacks
const devClusterStack = new ClusterStack(app, 'DevCluster', {
    cidr: '10.1.0.0/20'
});
devClusterStack.node.apply(new cdk.Tag('environment', 'dev'));

const qaClusterStack = new ClusterStack(app, 'QACluster', {
    cidr: '10.2.0.0/20'
});
qaClusterStack.node.apply(new cdk.Tag('environment', 'qa'));

const prodClusterStack = new ClusterStack(app, 'ProdCluster', {
    cidr: '10.3.0.0/20'
});
prodClusterStack.node.apply(new cdk.Tag('environment', 'prod'));

// CodePipeline stacks
const devPipelineStack = new DevPipelineStack(app, 'DevPipelineStack');

// App Stacks
const devAppStack = new AppStack(app, 'DevAppStack', {
    vpc: devClusterStack.vpc,
    cluster: devClusterStack.cluster,
    autoDeploy: false,
    appImage: devPipelineStack.appBuiltImage,
    nginxImage: devPipelineStack.nginxBuiltImage,
});
devAppStack.node.apply(new cdk.Tag('environment', 'prod'));

