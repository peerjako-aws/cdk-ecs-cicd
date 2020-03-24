import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as ecr from '@aws-cdk/aws-ecr';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { PipelineContainerImage } from "./pipeline-container-image";

import { githubOwner, repoName, awsSecretsGitHubTokenName, gitProdBranch, ssmImageTagParamName, stagingValidationEmail } from '../config'

export interface StagingProdPipelineStackProps extends cdk.StackProps {
    appRepository: ecr.Repository;
    nginxRepository: ecr.Repository;
    imageTag: string;
}

export class StagingProdPipelineStack extends cdk.Stack {
    public readonly appRepository: ecr.Repository;
    public readonly appBuiltImageStaging: PipelineContainerImage;
    public readonly appBuiltImageProd: PipelineContainerImage;
  
    public readonly nginxRepository: ecr.Repository;
    public readonly nginxBuiltImageStaging: PipelineContainerImage;
    public readonly nginxBuiltImageProd: PipelineContainerImage;
  
    constructor(scope: cdk.Construct, id: string, props: StagingProdPipelineStackProps) {
        super(scope, id, {
          ...props,
          //autoDeploy: false,
        });

        this.appRepository = props.appRepository;
        this.appBuiltImageStaging = new PipelineContainerImage(this.appRepository);
        this.appBuiltImageProd = new PipelineContainerImage(this.appRepository);
    
        this.nginxRepository = props.nginxRepository;
        this.nginxBuiltImageStaging = new PipelineContainerImage(this.nginxRepository);
        this.nginxBuiltImageProd = new PipelineContainerImage(this.nginxRepository);
    
        const sourceOutput = new codepipeline.Artifact();
        
        const sourceAction = new codepipeline_actions.GitHubSourceAction({
          actionName: 'GitHub',
          owner: githubOwner,
          repo: repoName,
          oauthToken: cdk.SecretValue.secretsManager(awsSecretsGitHubTokenName),
          output: sourceOutput,
          trigger: codepipeline_actions.GitHubTrigger.NONE,
          branch: gitProdBranch
        });

        const cdkBuild = new codebuild.PipelineProject(this, 'CdkBuildProject', {
            environment: {
              buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_14_1,
            },
            buildSpec: codebuild.BuildSpec.fromObject({
              version: '0.2',
              phases: {
                install: {
                  commands: [
                    'cd cdk',
                    'npm install',
                  ],
                },
                build: {
                  commands: [
                    'npm run build',
                    'npm run cdk synth StagingAppStack -- -o .',
                    'npm run cdk synth ProdAppStack -- -o .',
                    'IMAGE_TAG=`aws ssm get-parameter --name "' + ssmImageTagParamName + '" --output text --query Parameter.Value`',
                    `printf '{ "imageTag": "'$IMAGE_TAG'" }' > imageTag.json`,
                    'ls',
                  ],
                },
              },
              artifacts: {
                'base-directory': 'cdk',
                files: [
                    'StagingAppStack.template.json',
                    'ProdAppStack.template.json',
                    'imageTag.json'
                ],
                
              },
            }),
          });
          cdkBuild.addToRolePolicy(new iam.PolicyStatement(
            {
              effect: iam.Effect.ALLOW,
              actions: ['ssm:GetParameter'],
              resources: ['arn:aws:ssm:*:*:parameter/' + ssmImageTagParamName]
            })
          );
          cdkBuild.addToRolePolicy(new iam.PolicyStatement(
            {
              effect: iam.Effect.ALLOW,
              actions: ['ec2:DescribeAvailabilityZones'],
              resources: ['*']
            })
          );
          
          const cdkBuildOutput = new codepipeline.Artifact();
    
          new codepipeline.Pipeline(this, 'Pipeline', {
            stages: [
              {
                stageName: 'Source',
                actions: [sourceAction],
              },
              {
                stageName: 'Build',
                actions: [
                  new codepipeline_actions.CodeBuildAction({
                    actionName: 'CdkBuild',
                    project: cdkBuild,
                    input: sourceOutput,
                    outputs: [cdkBuildOutput],
                  })
                ],
              },
              {
                stageName: 'DeployStaging',
                actions: [
                  new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                    actionName: 'CFN_Deploy',
                    stackName: 'StagingAppStack',
                    templatePath: cdkBuildOutput.atPath('StagingAppStack.template.json'),
                    adminPermissions: true,
                    runOrder: 1,
                    parameterOverrides: {
                        [this.appBuiltImageStaging.paramName]: cdkBuildOutput.getParam('imageTag.json', 'imageTag'),
                        [this.nginxBuiltImageStaging.paramName]: cdkBuildOutput.getParam('imageTag.json', 'imageTag'),
                      },
                      extraInputs: [cdkBuildOutput],
                    }),
                  new codepipeline_actions.ManualApprovalAction({
                      actionName: 'Validation',
                      runOrder: 2,
                      notifyEmails: [
                        stagingValidationEmail
                      ]
                  })
                ],
              },
              {
                stageName: 'DeployProd',
                actions: [
                  new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                    actionName: 'CFN_Deploy',
                    stackName: 'ProdAppStack',
                    templatePath: cdkBuildOutput.atPath('ProdAppStack.template.json'),
                    adminPermissions: true,
                    parameterOverrides: {
                        [this.appBuiltImageProd.paramName]: cdkBuildOutput.getParam('imageTag.json', 'imageTag'),
                        [this.nginxBuiltImageProd.paramName]: cdkBuildOutput.getParam('imageTag.json', 'imageTag'),
                      },
                      extraInputs: [cdkBuildOutput],
                    }),
                ],
              },
            ],
          });
    
    }
}    