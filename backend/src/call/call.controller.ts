import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CallService } from './call.service';

@SkipThrottle()
@Controller('call')
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('dtmf/:attemptId')
  handleDtmf(
    @Param('attemptId') attemptId: string,
    @Body() body: any,
  ) {
    return this.callService.handleDtmfCallback(
      Number(attemptId),
      body?.dtmfInput ?? body?.dtmf ?? body?.Digits,
      Number(body?.durationSeconds ?? body?.duration ?? body?.CallDuration ?? 0),
    );
  }

  @Get('twiml')
  twiml(
    @Query('audio') audio: string,
    @Query('cb') cb: string,
    @Res() res: any,
  ) {
    const xml = this.callService.buildTwimlResponse(audio, cb);
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    return res.send(xml);
  }
}
