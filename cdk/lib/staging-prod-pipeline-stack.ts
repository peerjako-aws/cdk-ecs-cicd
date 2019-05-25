import cdk = require('@aws-cdk/cdk');
import ecr = require('@aws-cdk/aws-ecr');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import { PipelineContainerImage } from "./pipeline-container-image";

export interface StagingProdPipelineStackProps extends cdk.StackProps {
    appRepository: ecr.Repository;
    nginxRepository: ecr.Repository;
    imageTag: string;
}

export class StagingProdPipelineStack extends cdk.Stack {
    public readonly appRepository: ecr.Repository;
    public readonly appBuiltImage: PipelineContainerImage;
  
    public readonly nginxRepository: ecr.Repository;
    public readonly nginxBuiltImage: PipelineContainerImage;
  
    constructor(scope: cdk.Construct, id: string, props: StagingProdPipelineStackProps) {
        super(scope, id, {
          ...props,
          autoDeploy: false,
        });

        this.appRepository = props.appRepository;
        this.appBuiltImage = new PipelineContainerImage(this.appRepository);
    
        this.nginxRepository = props.nginxRepository;
        this.nginxBuiltImage = new PipelineContainerImage(this.nginxRepository);
    
        const sourceOutput = new codepipeline.Artifact();

        const sourceAction = new codepipeline_actions.GitHubSourceAction({
          actionName: 'GitHub',
          owner: 'peerjako-aws',
          repo: 'cdk-ecs-cicd',
          oauthToken: cdk.SecretValue.secretsManager('github-personal-access-token'),
          output: sourceOutput,
          trigger: codepipeline_actions.GitHubTrigger.None
        });

        const cdkBuild = new codebuild.PipelineProject(this, 'CdkBuildProject', {
            environment: {
              buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_14_1,
            },
            buildSpec: {
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
                    'ls',
                  ],
                },
              },
              artifacts: {
                'base-directory': 'cdk',
                files: '*.template.yaml',
              },
            },
          });
    
          const cdkBuildOutput = new codepipeline.Artifact();
    
          new codepipeline.Pipeline(this, 'Pipeline', {
            stages: [
              {
                name: 'Source',
                actions: [sourceAction],
              },
              {
                name: 'Build',
                actions: [
                  new codepipeline_actions.CodeBuildAction({
                    actionName: 'CdkBuild',
                    project: cdkBuild,
                    input: sourceOutput,
                    output: cdkBuildOutput,
                  })
                ],
              },
              {
                name: 'DeployStaging',
                actions: [
                  new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                    actionName: 'CFN_Deploy',
                    stackName: 'StagingAppStack',
                    templatePath: cdkBuildOutput.atPath('StagingAppStack.template.yaml'),
                    adminPermissions: true,
                    parameterOverrides: {
                      [this.appBuiltImage.paramName]: props.imageTag,
                      [this.nginxBuiltImage.paramName]: props.imageTag,
                    }
                  }),
                ],
              },
            ],
          });
    
    }
}    