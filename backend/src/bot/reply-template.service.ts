import { Injectable } from '@nestjs/common';

@Injectable()
export class ReplyTemplateService {
  genericFallback() {
    return 'আপনার প্রশ্নটি নোট করা হয়েছে। প্রয়োজন হলে আমাদের এজেন্ট আরও তথ্য দেবে।';
  }

  processingReply() {
    return 'স্ক্রিনশট পেয়েছি ✅\nProcessing হচ্ছে... ⏳';
  }

  orderCapturedReply() {
    return 'আপনার তথ্য নেওয়া হয়েছে। অর্ডার/মেমো টিম পরবর্তী ধাপে যাবে।';
  }

  orderConfirmedReply() {
    return 'আপনার অর্ডার কনফার্ম হয়েছে। পরবর্তী আপডেট জানানো হবে।';
  }

  orderCancelledReply() {
    return 'আপনার অর্ডার বাতিল হিসেবে নোট করা হয়েছে।';
  }

  sizeReply() {
    return this.genericFallback();
  }

  photoReply() {
    return this.genericFallback();
  }

  deliveryTimeReply() {
    return this.genericFallback();
  }

  deliveryFeeReply() {
    return this.genericFallback();
  }
}
