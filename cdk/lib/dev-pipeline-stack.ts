import cdk = require('@aws-cdk/cdk');
import iam = require('@aws-cdk/aws-iam');
import ecr = require('@aws-cdk/aws-ecr');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import { PipelineContainerImage } from "./pipeline-container-image";
import { PolicyStatementEffect } from '@aws-cdk/aws-iam';

export class DevPipelineStack extends cdk.Stack {
  public readonly appRepository: ecr.Repository;
  public readonly appBuiltImage: PipelineContainerImage;

  public readonly nginxRepository: ecr.Repository;
  public readonly nginxBuiltImage: PipelineContainerImage;

  public readonly imageTag: string;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      autoDeploy: false,
    });

    this.appRepository = new ecr.Repository(this, 'AppEcrRepo');
    this.appBuiltImage = new PipelineContainerImage(this.appRepository);

    this.nginxRepository = new ecr.Repository(this, 'NginxEcrRepo');
    this.nginxBuiltImage = new PipelineContainerImage(this.nginxRepository);

    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub',
      owner: 'peerjako-aws',
      repo: 'cdk-ecs-cicd',
      oauthToken: cdk.SecretValue.secretsManager('github-personal-access-token'),
      output: sourceOutput,
      trigger: codepipeline_actions.GitHubTrigger.Poll,
    });

    const dockerBuild = new codebuild.PipelineProject(this, 'DockerCodeBuildProject', {
        environment: {
          buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_17_09_0,
          privileged: true,
        },
        buildSpec: {
          version: '0.2',
          phases: {
            pre_build: {
              commands: '$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)',
            },
            build: {
              commands:[
                'docker build -t $APP_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION app',
                'docker build -t $NGINX_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION nginx'
              ]
            },
            post_build: {
              commands: [
                'docker push $APP_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
                'docker push $NGINX_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
                `printf '{ "imageTag": "'$CODEBUILD_RESOLVED_SOURCE_VERSION'" }' > imageTag.json`,
                'aws ssm put-parameter --name "latest-dev-imagetag" --value $CODEBUILD_RESOLVED_SOURCE_VERSION --type String --overwrite'
              ],
            },
          },
          artifacts: {
            files: 'imageTag.json',
          },
        },
        environmentVariables: {
          'APP_REPOSITORY_URI': {
            value: this.appRepository.repositoryUri,
          },
          'NGINX_REPOSITORY_URI': {
            value: this.nginxRepository.repositoryUri,
          },
        },
      });
      dockerBuild.addToRolePolicy(new iam.PolicyStatement(PolicyStatementEffect.Allow)
        .addResource('arn:aws:ssm:*:*:parameter/latest-dev-imagetag')
        .addAction('ssm:PutParameter')
      );
      this.appRepository.grantPullPush(dockerBuild);
      this.nginxRepository.grantPullPush(dockerBuild);

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
                'npm run cdk synth DevAppStack -- -o .',
                'ls',
              ],
            },
          },
          artifacts: {
            'base-directory': 'cdk',
            files: 'DevAppStack.template.yaml',
          },
        },
      });

      const dockerBuildOutput = new codepipeline.Artifact("DockerBuildOutput");
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
                actionName: 'DockerBuild',
                project: dockerBuild,
                input: sourceOutput,
                output: dockerBuildOutput,
              }),
              new codepipeline_actions.CodeBuildAction({
                actionName: 'CdkBuild',
                project: cdkBuild,
                input: sourceOutput,
                output: cdkBuildOutput,
              })
            ],
          },
          {
            name: 'Deploy',
            actions: [
              new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                actionName: 'CFN_Deploy',
                stackName: 'DevAppStack',
                templatePath: cdkBuildOutput.atPath('DevAppStack.template.yaml'),
                adminPermissions: true,
                parameterOverrides: {
                  [this.appBuiltImage.paramName]: dockerBuildOutput.getParam('imageTag.json', 'imageTag'),
                  [this.nginxBuiltImage.paramName]: dockerBuildOutput.getParam('imageTag.json', 'imageTag'),
                },
                extraInputs: [dockerBuildOutput],
              }),
            ],
          },
        ],
      });
   
      this.imageTag = dockerBuildOutput.getParam('imageTag.json', 'imageTag');
    }
  }