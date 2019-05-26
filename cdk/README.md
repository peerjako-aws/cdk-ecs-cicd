# Deploying it all

## Initial steps

First of all you need to fork this repo, clone it and configure the config.ts file as described in the Getting Started section [here](../README.md).

Open a terminal and change dir into the cdk directory, install dependencies and compile the typescript files to js files

```bash
cd cdk
npm ci
npm run watch
```

## Deploying VPCs and ECS Clusters

The CICD pipelines expect that the Dev and Prod ECS Clusters / VPCs have already been deployed. Open an new terminal, change dir into the cdk directory, list all the stacks and then deploy both the DevCluster and ProdCluster stacks

```bash
cd cdk
cdk list
cdk deploy DevCluster
cdk deploy ProdCluster
```

Wait for the stacks to finish their deployment. You can verify that you have a dev and prod ECS Cluster here:

https://console.aws.amazon.com/ecs/home#/clusters

## Deploying the Dev Pipeline

Now deploy the dev pipeline

```bash
cdk deploy DevPipelineStack
```

Once deployed it will immediately start running, create ECR repos, build docker images and push them into those ECR repos, use CDK synth to create a CloudFormation template for the **DevAppStack** and deploy that CloudFormation stack.

You can check out the following AWS created resources:

- Pipeline: https://console.aws.amazon.com/codesuite/codepipeline/pipelines

- ECR repos: https://console.aws.amazon.com/ecr/repositories

- SSM Image Tag parameter: https://console.aws.amazon.com/systems-manager/parameters

- CloudFormation stacks: https://console.aws.amazon.com/cloudformation/home#/stacks

  

Once the **DevAppStack** is fully deployed you can go into its **Outputs** tab and get the DNS of the load balancer. Navigate to that DNS in your browser to verify the Penguin app is running.

## Deploying the Staging / Prod Pipeline

Now deploy the staging / prod pipeline

```bash
cdk deploy StagingProdPipelineStack
```

The pipeline will only start when manually triggered so once deploy go into the pipeline starting with the name StagingProd* in the pipeline console:

https://console.aws.amazon.com/codesuite/codepipeline/pipelines

Click the **Release Change** button to run the pipeline. Once the pipeline reaches the Validation step go into the **StagingAppStack** CloudFormation stack and find the load balancer DNS in the Outputs tab. Check that the staging Penguin app is working by navigating to that DNS in your browser.

If all looks good in the staging app, then approve the manual validation step to let the pipeline continue to the deployment of the **ProdAppStack**. Once the **ProdAppStack** has been deployed you can verify that the Penguin app is running by getting the load balancer DNS of that stack.

## Update the app

To verify that the CICD workflow is working you can try to do some visual changes to the index.html file. Go into the app folder, change the index.html file, commit and push to the github dev branch and verify that the dev pipeline starts running and deploys your changes

```
git checkout dev
cd app/templates
DO SOME CHANGES TO index.html e.g. change some text
git commit -am "Changing front page"
git push
```

Go into the pipeline and wait for the Source action to start pulling your changes:

https://console.aws.amazon.com/codesuite/codepipeline/pipelines

## Cleaning up

The resources created does incur cost so remember to clean up by running cdk destroy on the stacks. Cost is mainly for the ECS Fargate tasks, the load balancers and the VPC NAT gateways. To delete everything run the following

```
cdk destroy DevPipelineStack
cdk destroy StagingProdPipelineStack
cdk destroy ProdCluster
cdk destroy DevCluster
```



# Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
