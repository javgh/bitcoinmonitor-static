$(document).ready(function () {
    $('.qrcode_wrapper').each(function() {
        $qrlink = $(this).children('a:first');

        $qrlink.bind('mouseenter', function() {
            $qrcode = $(this).parent().children('img:first');
            $qrcode.show();
        });
        $qrlink.bind('mouseleave', function() {
            $qrcode = $(this).parent().children('img:first');
            $qrcode.hide();
        });

        $qrlink.bind('click', function(e) {
            e.preventDefault();
            $qrcode = $(this).parent().children('img:first');
            if ($qrcode.is(':visible')) {
                $qrcode.hide();
            } else {
                $qrcode.show();
            };
        });
    });
});
